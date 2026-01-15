import logging
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Optional

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import Market
from ..services.auth import get_user_from_request
from ..services.amm.execution import ExecutionError, execute_buy, execute_sell
from ..services.orders import parse_buy_payload, parse_json_body, parse_sell_payload

logger = logging.getLogger(__name__)

BPS_DENOM = Decimal("10000")
PRICE_QUANT = Decimal("0.0001")  # 4dp price formatting


def _safe_decimal(v: Any) -> Optional[Decimal]:
    if v is None:
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _price_from_bps(bps: Any) -> Optional[Decimal]:
    d = _safe_decimal(bps)
    if d is None or d <= 0:
        return None
    return (d / BPS_DENOM).quantize(PRICE_QUANT, rounding=ROUND_HALF_UP)


def _compute_avg_price_bps_from_amounts(*, amount: Optional[Decimal], shares: Optional[Decimal]) -> Optional[int]:
    """
    Fallback if execution didn't return avg_price_bps:
      avg_price = amount / shares
      avg_price_bps = round(avg_price * 10000)
    """
    if amount is None or shares is None or shares <= 0:
        return None
    bps = (amount / shares * BPS_DENOM).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    try:
        return int(bps)
    except Exception:
        return None


def _get_chain(market_id) -> str:
    chain = Market.objects.filter(pk=market_id).values_list("chain", flat=True).first()
    return chain or "evm"


def _extract_target_prob_bps(result: dict, option_index: int) -> Optional[int]:
    """
    execution 返回 pre/post_prob_bps 通常是 List[int]（每个 option 一个 bps）
    这里取目标 option 的 bps。
    """
    for key in ("post_prob_bps", "pre_prob_bps"):
        arr = result.get(key)
        if isinstance(arr, list) and 0 <= option_index < len(arr):
            try:
                return int(arr[option_index])
            except Exception:
                return None

    # 极端兜底：若某实现返回单值 int
    for key in ("post_prob_bps", "pre_prob_bps"):
        v = result.get(key)
        if isinstance(v, int):
            return int(v)

    return None


def _build_buy_response(*, result: dict, market_id, token: str) -> dict:
    option_index = int(result.get("option_index") or 0)
    chain = _get_chain(market_id)

    amount_in = _safe_decimal(result.get("amount_in"))
    shares_out = _safe_decimal(result.get("shares_out"))  # payout shares on win
    fee_amount = _safe_decimal(result.get("fee_amount"))

    # ✅ 优先信任 execution 的 avg_price_bps
    avg_price_bps = result.get("avg_price_bps")

    # ✅ 若极端缺失，则用 amount_in / shares_out 反算
    if avg_price_bps is None:
        avg_price_bps = _compute_avg_price_bps_from_amounts(amount=amount_in, shares=shares_out)

    price = _price_from_bps(avg_price_bps)

    # 概率：取目标 option 的 post_prob_bps（没有则 pre）
    probability_bps = _extract_target_prob_bps(result, option_index)

    # ✅ 最后兜底：如果 price 仍然缺失（非常不应发生），用 probability_bps 推一个展示 price
    if price is None and probability_bps is not None:
        price = _price_from_bps(probability_bps)

    # 兼容旧前端：to_win 默认按“净利润”返回（shares_out - amount_in）
    # 如果你旧前端其实展示的是 payout，把这一行换成 to_win = shares_out
    to_win = None
    if amount_in is not None and shares_out is not None:
        to_win = shares_out - amount_in

    position = result.get("position") or {}
    balance_available = result.get("balance_available")

    return {
        # ——旧结构字段（尽量保持）——
        "market_id": str(result.get("market_id") or market_id),
        "option_id": result.get("option_id"),
        "option_index": option_index,
        "side": "buy",
        "token": token,
        "chain": chain,
        "amount_in": str(amount_in) if amount_in is not None else None,
        "shares": str(shares_out) if shares_out is not None else None,
        "price": str(price) if price is not None else None,
        "probability_bps": probability_bps,
        "to_win": str(to_win) if to_win is not None else None,
        "balance_available": str(balance_available) if balance_available is not None else None,
        "position": {
            "shares": str(position.get("shares")) if position.get("shares") is not None else None,
            "cost_basis": str(position.get("cost_basis")) if position.get("cost_basis") is not None else None,
        },
        # ——不破坏前端的额外信息（调试/过渡用）——
        "order_intent_id": result.get("order_intent_id"),
        "fee_amount": str(fee_amount) if fee_amount is not None else None,
        "avg_price_bps": avg_price_bps,
        "pre_prob_bps": result.get("pre_prob_bps"),
        "post_prob_bps": result.get("post_prob_bps"),
        "option_ids": result.get("option_ids"),
    }


def _build_sell_response(*, result: dict, market_id, token: str) -> dict:
    option_index = int(result.get("option_index") or 0)
    chain = _get_chain(market_id)

    amount_out = _safe_decimal(result.get("amount_out"))
    shares_sold = _safe_decimal(result.get("shares_sold"))
    fee_amount = _safe_decimal(result.get("fee_amount"))

    # ✅ 优先信任 execution 的 avg_price_bps
    avg_price_bps = result.get("avg_price_bps")

    # ✅ 若极端缺失，则用 amount_out / shares_sold 反算
    if avg_price_bps is None:
        avg_price_bps = _compute_avg_price_bps_from_amounts(amount=amount_out, shares=shares_sold)

    price = _price_from_bps(avg_price_bps)

    probability_bps = _extract_target_prob_bps(result, option_index)
    if price is None and probability_bps is not None:
        price = _price_from_bps(probability_bps)

    # 兼容旧接口字段：很多旧前端把卖出“得到的钱”也叫 amount_in（成交额）
    amount_in_compat = amount_out
    to_win = amount_out  # sell 一般展示“你将收到多少”

    position = result.get("position") or {}
    balance_available = result.get("balance_available")

    return {
        # ——旧结构字段（尽量保持）——
        "market_id": str(result.get("market_id") or market_id),
        "option_id": result.get("option_id"),
        "option_index": option_index,
        "side": "sell",
        "token": token,
        "chain": chain,
        "amount_in": str(amount_in_compat) if amount_in_compat is not None else None,
        "shares": str(shares_sold) if shares_sold is not None else None,
        "price": str(price) if price is not None else None,
        "probability_bps": probability_bps,
        "to_win": str(to_win) if to_win is not None else None,
        "balance_available": str(balance_available) if balance_available is not None else None,
        "position": {
            "shares": str(position.get("shares")) if position.get("shares") is not None else None,
            "cost_basis": str(position.get("cost_basis")) if position.get("cost_basis") is not None else None,
        },
        # ——不破坏前端的额外信息（调试/过渡用）——
        "order_intent_id": result.get("order_intent_id"),
        "amount_out": str(amount_out) if amount_out is not None else None,
        "fee_amount": str(fee_amount) if fee_amount is not None else None,
        "avg_price_bps": avg_price_bps,
        "pre_prob_bps": result.get("pre_prob_bps"),
        "post_prob_bps": result.get("post_prob_bps"),
        "option_ids": result.get("option_ids"),
    }


def _handle_buy(*, user, market_id, payload: dict) -> JsonResponse:
    parsed, error = parse_buy_payload(payload)
    if error:
        return error

    try:
        result = execute_buy(
            user=user,
            market_id=market_id,
            option_id=parsed["option_id"],
            option_index=parsed["option_index"],
            amount_in=parsed["amount_in"],
            token=parsed["token"],
            wallet_id=parsed["wallet_id"],
            client_nonce=parsed["client_nonce"],
            min_shares_out=parsed["min_shares_out"],
            max_slippage_bps=parsed["max_slippage_bps"],
        )
    except ExecutionError as exc:
        return JsonResponse(exc.to_payload(), status=getattr(exc, "http_status", 400))
    except Exception:
        logger.exception("Unexpected error in execute_buy", extra={"market_id": str(market_id)})
        return JsonResponse({"error": "Internal server error"}, status=500)

    data = _build_buy_response(result=result, market_id=market_id, token=parsed["token"])
    return JsonResponse(data, status=201)


def _handle_sell(*, user, market_id, payload: dict) -> JsonResponse:
    parsed, error = parse_sell_payload(payload)
    if error:
        return error

    try:
        result = execute_sell(
            user=user,
            market_id=market_id,
            option_id=parsed["option_id"],
            option_index=parsed["option_index"],
            shares=parsed["shares"],
            desired_amount_out=parsed["amount_out"],
            sell_all=parsed["sell_all"],
            token=parsed["token"],
            wallet_id=parsed["wallet_id"],
            client_nonce=parsed["client_nonce"],
            min_amount_out=parsed["min_amount_out"],
        )
    except ExecutionError as exc:
        return JsonResponse(exc.to_payload(), status=getattr(exc, "http_status", 400))
    except Exception:
        logger.exception("Unexpected error in execute_sell", extra={"market_id": str(market_id)})
        return JsonResponse({"error": "Internal server error"}, status=500)

    data = _build_sell_response(result=result, market_id=market_id, token=parsed["token"])
    return JsonResponse(data, status=201)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def place_buy_order(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    # Check if market is resolved or canceled
    market = Market.objects.filter(pk=market_id).first()
    if not market:
        return JsonResponse({"error": "Market not found"}, status=404)
    if market.status in ("resolved", "canceled"):
        return JsonResponse({"error": "Market is no longer accepting orders"}, status=400)

    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    return _handle_buy(user=user, market_id=market_id, payload=payload)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def place_sell_order(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    # Check if market is resolved or canceled
    market = Market.objects.filter(pk=market_id).first()
    if not market:
        return JsonResponse({"error": "Market not found"}, status=404)
    if market.status in ("resolved", "canceled"):
        return JsonResponse({"error": "Market is no longer accepting orders"}, status=400)

    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    return _handle_sell(user=user, market_id=market_id, payload=payload)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def place_order(request, market_id):
    """
    Backward-compatible entrypoint. Routes to buy/sell by payload.side.
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    # Check if market is resolved or canceled
    market = Market.objects.filter(pk=market_id).first()
    if not market:
        return JsonResponse({"error": "Market not found"}, status=404)
    if market.status in ("resolved", "canceled"):
        return JsonResponse({"error": "Market is no longer accepting orders"}, status=400)

    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    side = (payload.get("side") or "buy").lower()
    if side == "sell":
        return _handle_sell(user=user, market_id=market_id, payload=payload)
    return _handle_buy(user=user, market_id=market_id, payload=payload)
