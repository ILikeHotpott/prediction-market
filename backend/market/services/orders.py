import json
from decimal import Decimal, InvalidOperation

from django.http import JsonResponse
from django.utils import timezone

from ..models import (
    BalanceSnapshot,
    Market,
    MarketOption,
    MarketOptionStats,
    OrderIntent,
    Position,
    Wallet,
)


def parse_json_body(request):
    try:
        return json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return None


def ensure_wallet(user, wallet_id=None):
    """
    Ensure a placeholder wallet exists so order intent can be recorded.
    Prefers caller-specified wallet, then primary wallet, then any wallet, otherwise creates a web2 wallet.
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

    return Wallet.objects.create(
        user=user,
        chain_family="web2",
        address=f"web2-{user.id}",
        is_primary=True,
        created_at=now,
    )


def require_positive_decimal(raw_value, field_name):
    """
    Convert a payload value to Decimal and ensure > 0. Return (value, error_response).
    """
    try:
        value = Decimal(str(raw_value))
    except (InvalidOperation, TypeError):
        return None, JsonResponse({ "error": f"{field_name} must be a decimal number" }, status=400)
    if value <= 0:
        return None, JsonResponse({ "error": f"{field_name} must be greater than 0" }, status=400)
    return value, None


def parse_buy_payload(payload):
    amount_in, error = require_positive_decimal(payload.get("amount_in"), "amount_in")
    if error:
        return None, error
    return {
        "amount_in": amount_in,
        "token": payload.get("token") or "USDC",
        "option_id": payload.get("option_id"),
        "option_index": payload.get("option_index"),
        "wallet_id": payload.get("wallet_id"),
        "client_nonce": payload.get("client_nonce"),
    }, None


def parse_sell_payload(payload):
    shares, error = require_positive_decimal(payload.get("shares"), "shares")
    if error:
        return None, error
    return {
        "shares": shares,
        "token": payload.get("token") or "USDC",
        "option_id": payload.get("option_id"),
        "option_index": payload.get("option_index"),
        "wallet_id": payload.get("wallet_id"),
        "client_nonce": payload.get("client_nonce"),
    }, None


def get_market_and_option(market_id, option_id=None, option_index=None):
    now = timezone.now()
    try:
        market = Market.objects.select_for_update().get(pk=market_id)
    except Market.DoesNotExist:
        return None, None, None, JsonResponse({"error": "Market not found"}, status=404)

    event = getattr(market, "event", None)
    if event is None:
        try:
            event = market.event
        except Exception:
            event = None

    if event and (event.status != "active" or event.is_hidden):
        return None, None, None, JsonResponse({"error": "Event is not active"}, status=400)
    if market.status != "active" or market.is_hidden:
        return None, None, None, JsonResponse({"error": "Market is not active"}, status=400)

    deadline = market.trading_deadline or (event.trading_deadline if event else None)
    if deadline and deadline <= now:
        return None, None, None, JsonResponse({"error": "Trading deadline passed"}, status=400)

    option = None
    options_qs = MarketOption.objects.select_related("stats").filter(market=market)
    if option_id:
        try:
            option = options_qs.get(pk=option_id)
        except MarketOption.DoesNotExist:
            return None, None, None, JsonResponse({"error": "Option not found for market"}, status=404)
    elif option_index is not None:
        try:
            option = options_qs.get(option_index=option_index)
        except MarketOption.DoesNotExist:
            return None, None, None, JsonResponse({"error": "Option not found for market"}, status=404)
    else:
        return None, None, None, JsonResponse({"error": "option_id or option_index is required"}, status=400)

    if not option.is_active:
        return None, None, None, JsonResponse({"error": "Option is not active"}, status=400)

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
        return None, None, None, JsonResponse({"error": "Option price unavailable"}, status=422)

    option_price = Decimal(probability_bps) / Decimal(10000)
    if option_price <= 0:
        return None, None, None, JsonResponse({"error": "Option price invalid"}, status=422)

    return market, option, {"probability_bps": probability_bps, "option_price": option_price}, None


def get_balance(user, token, now):
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


def ensure_sufficient_balance(balance, amount):
    if balance.available_amount < amount:
        return JsonResponse({"error": "Insufficient balance"}, status=400)
    return None


def lock_balance(balance, amount, now):
    balance.available_amount -= amount
    balance.updated_at = now
    balance.save(update_fields=["available_amount", "updated_at"])


def credit_balance(balance, amount, now):
    balance.available_amount += amount
    balance.updated_at = now
    balance.save(update_fields=["available_amount", "updated_at"])


def apply_buy_position(user, market, option, amount_in, option_price, now):
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
    return position, shares


def apply_sell_position(user, market, option, shares_requested, option_price, now):
    try:
        position = Position.objects.select_for_update().get(
            user=user, market=market, option=option
        )
    except Position.DoesNotExist:
        return None, None, JsonResponse({"error": "No position to sell"}, status=400)

    if position.shares < shares_requested:
        return None, None, JsonResponse({"error": "Insufficient shares"}, status=400)

    proceeds = shares_requested * option_price
    avg_cost = position.cost_basis / position.shares if position.shares > 0 else Decimal(0)
    cost_reduction = avg_cost * shares_requested

    position.shares -= shares_requested
    position.cost_basis = max(Decimal(0), position.cost_basis - cost_reduction)
    position.updated_at = now
    position.save(update_fields=["shares", "cost_basis", "updated_at"])
    return position, proceeds, None


def update_stats(option, amount_delta, now):
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


def order_response(
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


def create_order_intent(
    *,
    user,
    wallet,
    market,
    option,
    side,
    amount_in,
    shares_out,
    client_nonce,
    now,
    chain,
):
    return OrderIntent.objects.create(
        user=user,
        wallet=wallet,
        market=market,
        option=option,
        side=side,
        amount_in=amount_in,
        shares_out=shares_out,
        chain=chain,
        status="created",
        client_nonce=client_nonce,
        created_at=now,
        updated_at=now,
    )


