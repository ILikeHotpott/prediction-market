"""
Redemption code views for deposit functionality.
"""

import json
from decimal import Decimal

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import BalanceSnapshot, RedemptionCode, User
from ..services.auth import get_user_from_request


def _get_admin_user(request):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None
    try:
        user = User.objects.get(pk=user_id)
        if user.role != "admin":
            return None
        return user
    except User.DoesNotExist:
        return None


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def generate_code(request):
    """
    POST /api/admin/redemption-codes/generate/
    Admin-only endpoint to generate a redemption code.
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    admin_user = _get_admin_user(request)
    if admin_user is None:
        return JsonResponse({"error": "Admin access required"}, status=403)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    amount = data.get("amount")
    if not amount:
        return JsonResponse({"error": "amount is required"}, status=400)

    try:
        amount = Decimal(str(amount))
        if amount <= 0:
            return JsonResponse({"error": "amount must be positive"}, status=400)
    except:
        return JsonResponse({"error": "Invalid amount"}, status=400)

    code = RedemptionCode.generate_code()
    redemption = RedemptionCode.objects.create(
        code=code,
        amount=amount,
        token=data.get("token", "USDC"),
        created_by=admin_user,
    )

    return JsonResponse({
        "code": redemption.code,
        "amount": str(redemption.amount),
        "token": redemption.token,
        "created_at": redemption.created_at.isoformat(),
    }, status=201)


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def list_codes(request):
    """
    GET /api/admin/redemption-codes/
    Admin-only endpoint to list all redemption codes.
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    admin_user = _get_admin_user(request)
    if admin_user is None:
        return JsonResponse({"error": "Admin access required"}, status=403)

    status_filter = request.GET.get("status")
    codes = RedemptionCode.objects.all().order_by("-created_at")
    if status_filter:
        codes = codes.filter(status=status_filter)

    items = []
    for c in codes[:100]:
        items.append({
            "id": c.id,
            "code": c.code,
            "amount": str(c.amount),
            "token": c.token,
            "status": c.status,
            "created_at": c.created_at.isoformat(),
            "used_at": c.used_at.isoformat() if c.used_at else None,
            "used_by": str(c.used_by_id) if c.used_by_id else None,
        })

    return JsonResponse({"items": items}, status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def redeem_code(request):
    """
    POST /api/users/me/redeem/
    User endpoint to redeem a code and add funds to balance.
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    code = data.get("code", "").strip().upper()
    if not code:
        return JsonResponse({"error": "code is required"}, status=400)

    with transaction.atomic():
        try:
            redemption = RedemptionCode.objects.select_for_update().get(code=code)
        except RedemptionCode.DoesNotExist:
            return JsonResponse({"error": "Invalid code"}, status=404)

        if redemption.status != "active":
            return JsonResponse({"error": "Code already used or expired"}, status=400)

        # Update redemption code status
        redemption.status = "used"
        redemption.used_by = user
        redemption.used_at = timezone.now()
        redemption.save()

        # Add funds to user balance
        balance, created = BalanceSnapshot.objects.get_or_create(
            user=user,
            token=redemption.token,
            defaults={"available_amount": Decimal(0), "locked_amount": Decimal(0)},
        )
        balance.available_amount += redemption.amount
        balance.updated_at = timezone.now()
        balance.save()

    return JsonResponse({
        "success": True,
        "amount": str(redemption.amount),
        "token": redemption.token,
        "new_balance": str(balance.available_amount),
    }, status=200)
