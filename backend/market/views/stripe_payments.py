"""
Stripe checkout + webhook handlers for coin top-ups.
"""

import json
import os
from decimal import Decimal, InvalidOperation

import stripe
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import BalanceSnapshot, ChainEvent, User
from ..services.auth import get_user_from_request
from ..services.cache import invalidate_user_portfolio
from ..services.stripe_payments import (
    USD_TO_COIN_RATE,
    get_coin_package,
    list_coin_packages,
    serialize_coin_package,
)


COIN_TOKEN = "USDC"


def _configure_stripe():
    secret_key = os.getenv("STRIPE_SECRET_KEY")
    if not secret_key:
        return None
    stripe.api_key = secret_key
    return secret_key


def _default_redirect_urls(request):
    origin = request.headers.get("Origin") or os.getenv("FRONTEND_URL")
    if not origin:
        origin = "http://localhost:3000"
    return {
        "success_url": f"{origin}/?deposit=success&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{origin}/?deposit=cancel",
    }


@require_http_methods(["GET", "OPTIONS"])
def list_packages(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    items = [serialize_coin_package(pkg) for pkg in list_coin_packages()]
    return JsonResponse({"items": items, "rate": str(USD_TO_COIN_RATE)}, status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_checkout_session(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    if not _configure_stripe():
        return JsonResponse({"error": "Stripe is not configured"}, status=500)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    package_id = data.get("package_id")
    package = get_coin_package(package_id)
    if not package:
        return JsonResponse({"error": "Invalid package"}, status=400)

    redirect_urls = _default_redirect_urls(request)
    success_url = os.getenv("STRIPE_SUCCESS_URL") or redirect_urls["success_url"]
    cancel_url = os.getenv("STRIPE_CANCEL_URL") or redirect_urls["cancel_url"]

    unit_amount = int((package.usd_amount * Decimal("100")).to_integral_value())

    description = f"{package.coins} coins"
    if package.bonus_coins:
        description = f"{description} (+{package.bonus_coins} bonus)"

    session = stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "usd",
                    "unit_amount": unit_amount,
                    "product_data": {
                        "name": f"{package.name} Coin Pack",
                        "description": description,
                    },
                },
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=str(user.id),
        metadata={
            "user_id": str(user.id),
            "package_id": package.id,
            "coins": str(package.coins),
            "bonus_coins": str(package.bonus_coins),
            "usd_amount": str(package.usd_amount),
        },
    )

    return JsonResponse({"url": session.url, "session_id": session.id}, status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def confirm_checkout_session(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    if not _configure_stripe():
        return JsonResponse({"error": "Stripe is not configured"}, status=500)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    session_id = data.get("session_id")
    if not session_id:
        return JsonResponse({"error": "session_id is required"}, status=400)

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.error.StripeError:
        return JsonResponse({"error": "Stripe session lookup failed"}, status=502)

    if session.get("payment_status") != "paid":
        return JsonResponse({"error": "Payment not completed"}, status=400)

    session_user_id = session.get("client_reference_id")
    metadata = session.get("metadata") or {}
    metadata_user_id = metadata.get("user_id")
    if session_user_id and str(session_user_id) != str(user.id):
        return JsonResponse({"error": "Session user mismatch"}, status=403)
    if metadata_user_id and str(metadata_user_id) != str(user.id):
        return JsonResponse({"error": "Session user mismatch"}, status=403)

    package = get_coin_package(metadata.get("package_id"))
    credit_amount = None
    if package:
        credit_amount = package.credit_amount
    else:
        try:
            coins = metadata.get("coins")
            if coins is not None:
                credit_amount = Decimal(str(coins))
        except (TypeError, ValueError, InvalidOperation):
            credit_amount = None

    if credit_amount is None:
        amount_total = session.get("amount_total")
        if amount_total is not None:
            credit_amount = (Decimal(str(amount_total)) / Decimal("100")) * USD_TO_COIN_RATE

    if credit_amount is None:
        return JsonResponse({"error": "Missing session metadata"}, status=400)

    session_tx_id = session.get("payment_intent") or session.get("id")
    applied = _apply_stripe_deposit(user, str(session_tx_id), credit_amount)
    balance = BalanceSnapshot.objects.filter(user=user, token=COIN_TOKEN).first()
    available = balance.available_amount if balance else Decimal("0")

    return JsonResponse({
        "success": True,
        "credited": applied,
        "amount": str(credit_amount),
        "new_balance": str(available),
    }, status=200)


def _apply_stripe_deposit(user: User, session_id: str, credit_amount: Decimal):
    with transaction.atomic():
        User.objects.select_for_update().get(pk=user.id)
        existing = ChainEvent.objects.filter(
            chain="stripe",
            event_type="deposit",
            tx_hash=session_id,
        ).first()
        if existing:
            return False

        balance, _ = BalanceSnapshot.objects.get_or_create(
            user=user,
            token=COIN_TOKEN,
            defaults={"available_amount": Decimal(0), "locked_amount": Decimal(0)},
        )
        balance.available_amount += credit_amount
        balance.updated_at = timezone.now()
        balance.save()
        transaction.on_commit(lambda: invalidate_user_portfolio(str(user.id)))

        ChainEvent.objects.create(
            user=user,
            market=None,
            chain="stripe",
            event_type="deposit",
            token=COIN_TOKEN,
            amount=credit_amount,
            block_number=0,
            block_time=timezone.now(),
            tx_hash=session_id,
            log_index=0,
        )
        return True


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def webhook(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    if not _configure_stripe():
        return JsonResponse({"error": "Stripe is not configured"}, status=500)

    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not webhook_secret:
        return JsonResponse({"error": "Stripe webhook secret missing"}, status=500)

    payload = request.body
    signature = request.META.get("HTTP_STRIPE_SIGNATURE")

    try:
        event = stripe.Webhook.construct_event(payload, signature, webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        return JsonResponse({"error": "Invalid signature"}, status=400)

    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        if session.get("payment_status") != "paid":
            return JsonResponse({"received": True}, status=200)

        metadata = session.get("metadata") or {}
        user_id = metadata.get("user_id")
        package = get_coin_package(metadata.get("package_id"))
        credit_amount = None

        if package:
            credit_amount = package.credit_amount
        else:
            try:
                coins = Decimal(str(metadata.get("coins")))
                credit_amount = coins
            except (TypeError, ValueError, InvalidOperation):
                credit_amount = None

        if not user_id or credit_amount is None:
            return JsonResponse({"error": "Missing metadata"}, status=400)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)

        session_id = session.get("payment_intent") or session.get("id")
        if session_id:
            _apply_stripe_deposit(user, str(session_id), credit_amount)

    return JsonResponse({"received": True}, status=200)
