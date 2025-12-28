import json
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Prefetch
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import (
    BalanceSnapshot,
    Market,
    MarketOption,
    MarketOptionStats,
    OrderIntent,
    Position,
    Wallet,
)
from .common import _get_user_from_request


def _ensure_wallet(user, wallet_id=None):
    """
    MVP: ensure a web2 placeholder wallet exists so order intent can be recorded.
    Falls back to provided wallet_id, then primary wallet, otherwise creates a web2 wallet.
    """
    now = timezone.now()
    if wallet_id:
        try:
            return Wallet.objects.get(pk=wallet_id, user=user)
        except Wallet.DoesNotExist:
            return None

    if user.primary_wallet_id:
        try:
            return Wallet.objects.get(pk=user.primary_wallet_id, user=user)
        except Wallet.DoesNotExist:
            pass

    existing = Wallet.objects.filter(user=user).order_by("-is_primary", "id").first()
    if existing:
        return existing

    # Create a placeholder web2 wallet record
    return Wallet.objects.create(
        user=user,
        chain_family="web2",
        address=f"web2-{user.id}",
        is_primary=True,
        created_at=now,
    )


def _parse_json(request):
    try:
        return json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return None


def _get_market_and_option(market_id, option_id=None, option_index=None):
    now = timezone.now()
    try:
        market = (
            Market.objects.select_for_update()
            .prefetch_related(
                Prefetch(
                    "options",
                    queryset=MarketOption.objects.prefetch_related("stats"),
                )
            )
            .get(pk=market_id)
        )
    except Market.DoesNotExist:
        return None, None, JsonResponse({"error": "Market not found"}, status=404)

    if market.status != "active" or market.is_hidden:
        return None, None, JsonResponse({"error": "Market is not active"}, status=400)

    if market.trading_deadline and market.trading_deadline <= now:
        return None, None, JsonResponse({"error": "Trading deadline passed"}, status=400)

    option = None
    if option_id:
        try:
            option = MarketOption.objects.select_related("stats").get(
                pk=option_id, market=market
            )
        except MarketOption.DoesNotExist:
            return None, None, JsonResponse({"error": "Option not found for market"}, status=404)
    elif option_index is not None:
        try:
            option = MarketOption.objects.select_related("stats").get(
                market=market, option_index=option_index
            )
        except MarketOption.DoesNotExist:
            return None, None, JsonResponse({"error": "Option not found for market"}, status=404)
    else:
        return None, None, JsonResponse({"error": "option_id or option_index is required"}, status=400)

    if not option.is_active:
        return None, None, JsonResponse({"error": "Option is not active"}, status=400)

    probability_bps = None
    if hasattr(option, "stats") and option.stats:
        probability_bps = option.stats.prob_bps
    else:
        try:
            stats = MarketOptionStats.objects.get(option=option)
            probability_bps = stats.prob_bps
        except MarketOptionStats.DoesNotExist:
            probability_bps = None

    if probability_bps is None:
        return None, None, JsonResponse({"error": "Option price unavailable"}, status=422)

    option_price = Decimal(probability_bps) / Decimal(10000)
    if option_price <= 0:
        return None, None, JsonResponse({"error": "Option price invalid"}, status=422)

    return market, option, {"probability_bps": probability_bps, "option_price": option_price}


def _get_balance(user, token, now):
    balance = (
        BalanceSnapshot.objects.select_for_update()
        .filter(user=user, token=token)
        .first()
    )
    if not balance:
        balance = BalanceSnapshot.objects.create(
            user=user,
            token=token,
            available_amount=0,
            locked_amount=0,
            updated_at=now,
        )
    return balance


def _update_stats(option, amount_delta, now):
    stats = getattr(option, "stats", None)
    if not stats:
        try:
            stats = MarketOptionStats.objects.select_for_update().get(option=option)
        except MarketOptionStats.DoesNotExist:
            stats = None
    if stats:
        stats.volume_total = (stats.volume_total or 0) + amount_delta
        stats.volume_24h = (stats.volume_24h or 0) + amount_delta
        stats.updated_at = now
        stats.save(update_fields=["volume_total", "volume_24h", "updated_at"])


def _order_response(
    *,
    order_intent,
    market,
    option,
    option_price,
    probability_bps,
    amount,
    shares,
    to_win,
    balance,
    token,
    position,
):
    return JsonResponse(
        {
            "order_intent_id": order_intent.id,
            "market_id": str(market.id),
            "option_id": option.id,
            "option_index": option.option_index,
            "price": str(option_price),
            "probability_bps": probability_bps,
            "amount_in": str(amount),
            "shares": str(shares),
            "to_win": str(to_win),
            "balance_available": str(balance.available_amount),
            "position": {
                "shares": str(position.shares),
                "cost_basis": str(position.cost_basis),
            },
            "chain": market.chain or "evm",
            "token": token,
            "side": order_intent.side,
        },
        status=201,
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def place_buy_order(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    payload = _parse_json(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    raw_amount = payload.get("amount_in")
    token = payload.get("token") or "USDC"
    option_id = payload.get("option_id")
    option_index = payload.get("option_index")
    wallet_id = payload.get("wallet_id")
    client_nonce = payload.get("client_nonce")

    try:
        amount_in = Decimal(str(raw_amount))
    except (InvalidOperation, TypeError):
        return JsonResponse({"error": "amount_in must be a decimal number"}, status=400)
    if amount_in <= 0:
        return JsonResponse({"error": "amount_in must be greater than 0"}, status=400)

    now = timezone.now()

    with transaction.atomic():
        market, option, meta = _get_market_and_option(
            market_id, option_id=option_id, option_index=option_index
        )
        if meta is None:
            return market  # meta carries JsonResponse on failure
        probability_bps = meta["probability_bps"]
        option_price = meta["option_price"]

        balance = _get_balance(user, token, now)
        if balance.available_amount < amount_in:
            return JsonResponse({"error": "Insufficient balance"}, status=400)

        balance.available_amount -= amount_in
        balance.updated_at = now
        balance.save(update_fields=["available_amount", "updated_at"])

        shares = amount_in / option_price
        position, created = Position.objects.select_for_update().get_or_create(
            user=user,
            market=market,
            option=option,
            defaults={
                "shares": shares,
                "cost_basis": amount_in,
                "created_at": now,
                "updated_at": now,
            },
        )
        if not created:
            position.shares += shares
            position.cost_basis += amount_in
            position.updated_at = now
            position.save(update_fields=["shares", "cost_basis", "updated_at"])

        _update_stats(option, amount_in, now)

        wallet = _ensure_wallet(user, wallet_id)
        if not wallet:
            return JsonResponse({"error": "User wallet not found"}, status=400)

        order_intent = OrderIntent.objects.create(
            user=user,
            wallet=wallet,
            market=market,
            option=option,
            side="buy",
            amount_in=amount_in,
            shares_out=shares,
            chain=market.chain or "evm",
            status="created",
            client_nonce=client_nonce,
            created_at=now,
            updated_at=now,
        )

    return _order_response(
        order_intent=order_intent,
        market=market,
        option=option,
        option_price=option_price,
        probability_bps=probability_bps,
        amount=amount_in,
        shares=shares,
        to_win=shares,
        balance=balance,
        token=token,
        position=position,
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def place_sell_order(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    payload = _parse_json(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    raw_shares = payload.get("shares")
    token = payload.get("token") or "USDC"
    option_id = payload.get("option_id")
    option_index = payload.get("option_index")
    wallet_id = payload.get("wallet_id")
    client_nonce = payload.get("client_nonce")

    try:
        shares_requested = Decimal(str(raw_shares))
    except (InvalidOperation, TypeError):
        return JsonResponse({"error": "shares must be a decimal number"}, status=400)
    if shares_requested <= 0:
        return JsonResponse({"error": "shares must be greater than 0"}, status=400)

    now = timezone.now()

    with transaction.atomic():
        market, option, meta = _get_market_and_option(
            market_id, option_id=option_id, option_index=option_index
        )
        if meta is None:
            return market  # meta carries JsonResponse on failure
        probability_bps = meta["probability_bps"]
        option_price = meta["option_price"]

        balance = _get_balance(user, token, now)

        try:
            position = Position.objects.select_for_update().get(
                user=user, market=market, option=option
            )
        except Position.DoesNotExist:
            return JsonResponse({"error": "No position to sell"}, status=400)

        if position.shares < shares_requested:
            return JsonResponse({"error": "Insufficient shares"}, status=400)

        proceeds = shares_requested * option_price
        avg_cost = (
            position.cost_basis / position.shares if position.shares > 0 else Decimal(0)
        )
        cost_reduction = avg_cost * shares_requested

        position.shares -= shares_requested
        position.cost_basis = max(Decimal(0), position.cost_basis - cost_reduction)
        position.updated_at = now
        position.save(update_fields=["shares", "cost_basis", "updated_at"])

        balance.available_amount += proceeds
        balance.updated_at = now
        balance.save(update_fields=["available_amount", "updated_at"])

        _update_stats(option, proceeds, now)

        wallet = _ensure_wallet(user, wallet_id)
        if not wallet:
            return JsonResponse({"error": "User wallet not found"}, status=400)

        order_intent = OrderIntent.objects.create(
            user=user,
            wallet=wallet,
            market=market,
            option=option,
            side="sell",
            amount_in=proceeds,
            shares_out=shares_requested,
            chain=market.chain or "evm",
            status="created",
            client_nonce=client_nonce,
            created_at=now,
            updated_at=now,
        )

    return _order_response(
        order_intent=order_intent,
        market=market,
        option=option,
        option_price=option_price,
        probability_bps=probability_bps,
        amount=proceeds,
        shares=shares_requested,
        to_win=Decimal(0),
        balance=balance,
        token=token,
        position=position,
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def place_order(request, market_id):
    """
    Backward-compatible entrypoint. Routes to buy/sell handlers by `side`.
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    payload = _parse_json(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    side = (payload.get("side") or "buy").lower()
    if side == "sell":
        request._body = json.dumps(payload).encode()
        return place_sell_order(request, market_id)
    request._body = json.dumps(payload).encode()
    return place_buy_order(request, market_id)

