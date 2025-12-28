import json
from decimal import Decimal

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import BalanceSnapshot, MarketOptionStats, OrderIntent, Position, User
from .common import _get_user_from_request


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def sync_user(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    try:
        payload = json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    user_id = payload.get("id")
    if not user_id:
        return JsonResponse({"error": "id is required"}, status=400)

    now = timezone.now()
    payload_role = payload.get("role")
    defaults = {
        "display_name": payload.get("display_name") or "",
        "avatar_url": payload.get("avatar_url"),
        # If caller doesn't provide role, keep existing role (if any) and default to "user" only on creation.
        "role": payload_role if payload_role else None,
        "updated_at": now,
    }

    user, created = User.objects.get_or_create(
        id=user_id,
        defaults={
            "display_name": defaults["display_name"],
            "avatar_url": defaults["avatar_url"],
            "role": defaults["role"] or "user",
            "created_at": now,
            "updated_at": now,
        },
    )

    if not created:
        update_fields = ["display_name", "avatar_url", "updated_at"]
        user.display_name = defaults["display_name"]
        user.avatar_url = defaults["avatar_url"]
        user.updated_at = now
        if payload_role:
            user.role = payload_role
            update_fields.append("role")
        user.save(update_fields=update_fields)

    return JsonResponse(
        {"id": str(user.id), "role": user.role, "display_name": user.display_name},
        status=200,
    )


@require_http_methods(["GET", "OPTIONS"])
def me(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    return JsonResponse(
        {
            "id": str(user.id),
            "role": user.role,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
        },
        status=200,
    )


@require_http_methods(["GET", "OPTIONS"])
def get_balance(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    token = request.GET.get("token") or "USDC"
    balance = BalanceSnapshot.objects.filter(user=user, token=token).first()
    available = balance.available_amount if balance else Decimal(0)
    locked = balance.locked_amount if balance else Decimal(0)

    return JsonResponse(
        {
            "token": token,
            "available_amount": str(available),
            "locked_amount": str(locked),
        },
        status=200,
    )


@require_http_methods(["GET", "OPTIONS"])
def portfolio(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    token = request.GET.get("token") or "USDC"
    balance = BalanceSnapshot.objects.filter(user=user, token=token).first()
    available = balance.available_amount if balance else Decimal(0)

    positions = (
        Position.objects.select_related("market", "option", "option__stats")
        .filter(user=user)
        .order_by("-updated_at")
    )

    items = []
    total_value = Decimal(0)
    for pos in positions:
        stats = getattr(pos.option, "stats", None)
        prob_bps = stats.prob_bps if stats else None
        price = Decimal(prob_bps) / Decimal(10000) if prob_bps is not None else None
        value = price * pos.shares if price is not None else Decimal(0)
        total_value += value
        items.append(
            {
                "market_id": str(pos.market_id),
                "market_title": pos.market.title,
                "option_id": pos.option_id,
                "option_title": pos.option.title,
                "probability_bps": prob_bps,
                "price": str(price) if price is not None else None,
                "shares": str(pos.shares),
                "cost_basis": str(pos.cost_basis),
                "value": str(value),
                "updated_at": pos.updated_at.isoformat() if pos.updated_at else None,
            }
        )

    return JsonResponse(
        {
            "balance": {
                "token": token,
                "available_amount": str(available),
            },
            "positions": items,
            "portfolio_value": str(total_value),
        },
        status=200,
    )


@require_http_methods(["GET", "OPTIONS"])
def order_history(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    intents = (
        OrderIntent.objects.select_related("market", "option")
        .filter(user=user)
        .order_by("-created_at")[:200]
    )
    items = []
    for intent in intents:
        prob_bps = None
        try:
            stats = MarketOptionStats.objects.get(option=intent.option)
            prob_bps = stats.prob_bps
        except MarketOptionStats.DoesNotExist:
            pass
        price = Decimal(prob_bps) / Decimal(10000) if prob_bps is not None else None
        items.append(
            {
                "id": intent.id,
                "market_id": str(intent.market_id),
                "market_title": intent.market.title if intent.market else None,
                "option_id": intent.option_id,
                "option_title": intent.option.title if intent.option else None,
                "side": intent.side,
                "amount_in": str(intent.amount_in) if intent.amount_in is not None else None,
                "shares_out": str(intent.shares_out) if intent.shares_out is not None else None,
                "status": intent.status,
                "probability_bps": prob_bps,
                "price": str(price) if price is not None else None,
                "created_at": intent.created_at.isoformat() if intent.created_at else None,
            }
        )

    return JsonResponse({"items": items}, status=200)

