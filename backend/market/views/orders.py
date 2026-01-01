import json
from decimal import Decimal

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import Market
from ..services.auth import get_user_from_request
from ..services.orders import (
    apply_buy_position,
    apply_sell_position,
    create_order_intent,
    credit_balance,
    ensure_sufficient_balance,
    ensure_wallet,
    get_balance,
    get_market_and_option,
    lock_balance,
    order_response,
    parse_buy_payload,
    parse_json_body,
    parse_sell_payload,
    update_stats,
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def place_buy_order(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    parsed, error = parse_buy_payload(payload)
    if error:
        return error

    now = timezone.now()

    with transaction.atomic():
        market, option, meta, error = get_market_and_option(
            market_id, option_id=parsed["option_id"], option_index=parsed["option_index"]
        )
        if error:
            return error
        probability_bps = meta["probability_bps"]
        option_price = meta["option_price"]

        balance = get_balance(user, parsed["token"], now)
        error = ensure_sufficient_balance(balance, parsed["amount_in"])
        if error:
            return error

        lock_balance(balance, parsed["amount_in"], now)
        position, shares = apply_buy_position(user, market, option, parsed["amount_in"], option_price, now)

        update_stats(option, parsed["amount_in"], now)

        wallet = ensure_wallet(user, parsed["wallet_id"])
        if not wallet:
            return JsonResponse({"error": "User wallet not found"}, status=400)

        order_intent = create_order_intent(
            user=user,
            wallet=wallet,
            market=market,
            option=option,
            side="buy",
            amount_in=parsed["amount_in"],
            shares_out=shares,
            chain=market.chain or "evm",
            client_nonce=parsed["client_nonce"],
            now=now,
        )

    return order_response(
        order_intent=order_intent,
        market=market,
        option=option,
        option_price=option_price,
        probability_bps=probability_bps,
        amount=parsed["amount_in"],
        shares=shares,
        to_win=shares,
        balance=balance,
        token=parsed["token"],
        position=position,
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def place_sell_order(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    parsed, error = parse_sell_payload(payload)
    if error:
        return error

    now = timezone.now()

    with transaction.atomic():
        market, option, meta, error = get_market_and_option(
            market_id, option_id=parsed["option_id"], option_index=parsed["option_index"]
        )
        if error:
            return error
        probability_bps = meta["probability_bps"]
        option_price = meta["option_price"]

        balance = get_balance(user, parsed["token"], now)

        position, proceeds, position_error = apply_sell_position(
            user, market, option, parsed["shares"], option_price, now
        )
        if position_error:
            return position_error

        credit_balance(balance, proceeds, now)

        update_stats(option, proceeds, now)

        wallet = ensure_wallet(user, parsed["wallet_id"])
        if not wallet:
            return JsonResponse({"error": "User wallet not found"}, status=400)

        order_intent = create_order_intent(
            user=user,
            wallet=wallet,
            market=market,
            option=option,
            side="sell",
            amount_in=proceeds,
            shares_out=parsed["shares"],
            chain=market.chain or "evm",
            client_nonce=parsed["client_nonce"],
            now=now,
        )

    return order_response(
        order_intent=order_intent,
        market=market,
        option=option,
        option_price=option_price,
        probability_bps=probability_bps,
        amount=proceeds,
        shares=parsed["shares"],
        to_win=Decimal(0),
        balance=balance,
        token=parsed["token"],
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

    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    side = (payload.get("side") or "buy").lower()
    if side == "sell":
        request._body = json.dumps(payload).encode()
        return place_sell_order(request, market_id)
    request._body = json.dumps(payload).encode()
    return place_buy_order(request, market_id)

