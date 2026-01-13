import logging
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from ..models import Market, MarketOption
from ..services.amm.errors import QuoteInputError, QuoteMathError, QuoteNotFoundError
from ..services.amm.quote import quote as quote_service
from ..services.cache import get_cached_quote, set_cached_quote

logger = logging.getLogger(__name__)


def _validate_market_and_option(market_id, option_id, option_index):
    """
    Guardrails: ensure market/event/option is tradable before quoting.
    Returns (market, option, error_response).
    """
    try:
        market = Market.objects.select_related("event").get(pk=market_id)
    except (Market.DoesNotExist, ValueError, TypeError):
        return None, None, JsonResponse(
            {"error": "Market not found", "code": "MARKET_NOT_FOUND"},
            status=404,
        )

    now = timezone.now()
    event = getattr(market, "event", None)

    if event and (event.status != "active" or event.is_hidden):
        return None, None, JsonResponse(
            {"error": "Event is not active", "code": "EVENT_NOT_ACTIVE"},
            status=400,
        )

    if market.status != "active" or market.is_hidden:
        return None, None, JsonResponse(
            {"error": "Market is not active", "code": "MARKET_NOT_ACTIVE"},
            status=400,
        )

    deadline = market.trading_deadline or (event.trading_deadline if event else None)
    if deadline and deadline <= now:
        return None, None, JsonResponse(
            {"error": "Trading deadline passed", "code": "MARKET_CLOSED"},
            status=400,
        )

    option = None
    if option_id or option_index is not None:
        try:
            if option_id:
                option = MarketOption.objects.get(pk=option_id, market=market)
            else:
                option = MarketOption.objects.get(market=market, option_index=option_index)
        except (MarketOption.DoesNotExist, ValueError, TypeError):
            return None, None, JsonResponse(
                {"error": "Option not found for market", "code": "OPTION_NOT_FOUND"},
                status=404,
            )

        if not option.is_active:
            return None, None, JsonResponse(
                {"error": "Option is not active", "code": "OPTION_NOT_ACTIVE"},
                status=400,
            )

    return market, option, None


@require_http_methods(["GET"])
def quote(request, market_id):
    """
    AMM quote endpoint for pre-trade price discovery.

    Supports ALL service capabilities:
      - buy: amount_in OR shares
      - sell: shares OR amount_out (alias: amount_in for backward-compat)

    Query params:
      - side: buy|sell (default: buy)
      - option_id or option_index: target outcome (exactly one)
      - amount_in or shares: exactly one
        * For SELL with amount: use amount_out=... (preferred).
          If amount_in is provided with sell, it is treated as desired NET amount_out.
    """
    side = (request.GET.get("side") or "buy").lower()
    if side not in {"buy", "sell"}:
        return JsonResponse(
            {"error": "side must be 'buy' or 'sell'", "code": "BAD_SIDE"},
            status=400,
        )

    option_id = request.GET.get("option_id") or None
    option_index_raw = request.GET.get("option_index")
    if option_id and option_index_raw not in (None, ""):
        return JsonResponse(
            {"error": "Provide only one of option_id or option_index", "code": "AMBIGUOUS_OPTION"},
            status=400,
        )

    option_index = None
    if option_index_raw not in (None, ""):
        try:
            option_index = int(option_index_raw)
        except (TypeError, ValueError):
            return JsonResponse(
                {"error": "option_index must be an integer", "code": "BAD_OPTION_INDEX"},
                status=400,
            )

    if not option_id and option_index is None:
        return JsonResponse(
            {"error": "option_id or option_index is required", "code": "MISSING_OPTION"},
            status=400,
        )

    # Parse money/shares.
    amount_in_raw = request.GET.get("amount_in")
    amount_out_raw = request.GET.get("amount_out")  # preferred explicit name for sell
    shares_raw = request.GET.get("shares")

    # Normalize empty strings to None
    amount_in_raw = amount_in_raw if amount_in_raw not in (None, "") else None
    amount_out_raw = amount_out_raw if amount_out_raw not in (None, "") else None
    shares_raw = shares_raw if shares_raw not in (None, "") else None

    # Prevent conflicting money params
    if amount_in_raw is not None and amount_out_raw is not None:
        return JsonResponse(
            {"error": "Provide only one of amount_in or amount_out", "code": "AMBIGUOUS_AMOUNT"},
            status=400,
        )

    # ✅ Strict semantic guard: BUY should NOT accept amount_out
    if side == "buy" and amount_out_raw is not None:
        return JsonResponse(
            {
                "error": "amount_out is not valid for buy side. Use shares or amount_in.",
                "code": "INVALID_PARAM",
            },
            status=400,
        )

    # For SELL, prefer amount_out naming; keep backward-compat with amount_in meaning "desired net out"
    amount_param = amount_out_raw if amount_out_raw is not None else amount_in_raw
    shares_param = shares_raw

    # Must provide exactly one of amount or shares
    if (amount_param is None and shares_param is None) or (amount_param is not None and shares_param is not None):
        return JsonResponse(
            {"error": "Provide exactly one of amount_in/amount_out or shares", "code": "BAD_AMOUNT_SHARES"},
            status=400,
        )

    # Validate tradability (market/event/deadline/option active)
    _, _, validation_error = _validate_market_and_option(market_id, option_id, option_index)
    if validation_error:
        return validation_error

    # Try cache first
    cache_key_option = option_id or str(option_index)
    cached = get_cached_quote(str(market_id), cache_key_option, side, amount_param or "", shares_param or "")
    if cached is not None:
        resp = JsonResponse(cached, status=200)
        resp["Cache-Control"] = "private, max-age=10"
        return resp

    # Call service
    try:
        data = quote_service(
            market_id=market_id,
            option_id=option_id,
            option_index=option_index,
            side=side,
            amount_in=amount_param,   # buy: amount_in; sell: desired net amount_out
            shares=shares_param,
        )
    except QuoteNotFoundError as exc:
        return JsonResponse({"error": str(exc), "code": "QUOTE_NOT_FOUND"}, status=404)
    except QuoteInputError as exc:
        return JsonResponse({"error": str(exc), "code": "QUOTE_INPUT_ERROR"}, status=400)
    except QuoteMathError as exc:
        return JsonResponse({"error": str(exc), "code": "QUOTE_MATH_ERROR"}, status=422)
    except Exception:
        logger.exception("Unexpected error in quote endpoint", extra={"market_id": str(market_id)})
        return JsonResponse({"error": "Internal server error", "code": "INTERNAL"}, status=500)

    # Cache the result
    set_cached_quote(str(market_id), cache_key_option, side, amount_param or "", shares_param or "", data)

    resp = JsonResponse(data, status=200)
    resp["Cache-Control"] = "private, max-age=10"
    return resp
