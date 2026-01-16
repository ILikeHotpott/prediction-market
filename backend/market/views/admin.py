"""
Admin views for market resolution and settlement.

These endpoints are intended for admin users only.
"""

import json
import logging
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import AmmPool, Event, Market, User
from ..models.users import UserRole
from ..services.amm.settlement import (
    SettlementError,
    resolve_and_settle_market,
    resolve_market,
    settle_market,
)

logger = logging.getLogger(__name__)


def _get_admin_user(request) -> Optional[User]:
    """Extract admin user from request. Returns None if not authenticated or not admin/superadmin."""
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None

    try:
        user = User.objects.get(pk=user_id)
        if user.role not in UserRole.ADMIN_ROLES:
            return None
        return user
    except User.DoesNotExist:
        return None


def _get_superadmin_user(request) -> Optional[User]:
    """Extract superadmin user from request. Returns None if not superadmin."""
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None

    try:
        user = User.objects.get(pk=user_id)
        if user.role != UserRole.SUPERADMIN:
            return None
        return user
    except User.DoesNotExist:
        return None


def _json_error(message: str, code: str, status: int = 400) -> JsonResponse:
    return JsonResponse({"error": message, "code": code}, status=status)


@csrf_exempt
@require_http_methods(["POST"])
def admin_resolve_market(request, market_id: str) -> JsonResponse:
    """
    POST /api/admin/markets/<market_id>/resolve/

    Resolve a market with a winning option.

    Request body:
    {
        "winning_option_id": "123",  // or
        "winning_option_index": 0
    }

    Response:
    {
        "market_id": "...",
        "status": "resolved",
        "resolved_at": "2024-01-04T12:00:00Z",
        "resolved_option_index": 0,
        "resolved_option_id": 123,
        "already_resolved": false
    }
    """
    admin_user = _get_admin_user(request)
    if admin_user is None:
        return _json_error("Admin access required", "UNAUTHORIZED", status=403)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return _json_error("Invalid JSON", "INVALID_JSON", status=400)

    winning_option_id = data.get("winning_option_id")
    winning_option_index = data.get("winning_option_index")

    if winning_option_id is None and winning_option_index is None:
        return _json_error(
            "winning_option_id or winning_option_index is required",
            "MISSING_PARAM",
            status=400,
        )

    try:
        result = resolve_market(
            market_id=market_id,
            winning_option_id=str(winning_option_id) if winning_option_id else None,
            winning_option_index=int(winning_option_index) if winning_option_index is not None else None,
            resolved_by_user_id=str(admin_user.id),
        )
        return JsonResponse(result)
    except SettlementError as e:
        return _json_error(str(e), e.code, status=e.http_status)
    except Exception as e:
        logger.exception("Error resolving market %s: %s", market_id, e)
        return _json_error("Internal server error", "INTERNAL_ERROR", status=500)


@csrf_exempt
@require_http_methods(["POST"])
def admin_settle_market(request, market_id: str) -> JsonResponse:
    """
    POST /api/admin/markets/<market_id>/settle/

    Settle a resolved market, paying out winners.

    Request body:
    {
        "settlement_tx_id": "optional-unique-id"  // for idempotency
    }

    Response:
    {
        "market_id": "...",
        "settlement_tx_id": "settle:uuid",
        "winning_option_id": 123,
        "winning_option_index": 0,
        "total_payout": "1000.00",
        "pool_cash_used": "800.00",
        "collateral_used": "200.00",
        "settled_at": "2024-01-04T12:00:00Z",
        "payouts_count": 10,
        "already_settled": false
    }
    """
    admin_user = _get_admin_user(request)
    if admin_user is None:
        return _json_error("Admin access required", "UNAUTHORIZED", status=403)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return _json_error("Invalid JSON", "INVALID_JSON", status=400)

    settlement_tx_id = data.get("settlement_tx_id")

    try:
        result = settle_market(
            market_id=market_id,
            settlement_tx_id=settlement_tx_id,
            settled_by_user_id=str(admin_user.id),
        )
        return JsonResponse(result)
    except SettlementError as e:
        return _json_error(str(e), e.code, status=e.http_status)
    except Exception as e:
        logger.exception("Error settling market %s: %s", market_id, e)
        return _json_error("Internal server error", "INTERNAL_ERROR", status=500)


@csrf_exempt
@require_http_methods(["POST"])
def admin_resolve_and_settle_market(request, market_id: str) -> JsonResponse:
    """
    POST /api/admin/markets/<market_id>/resolve-and-settle/

    Resolve and settle a market in one operation.

    Request body:
    {
        "winning_option_id": "123",  // or
        "winning_option_index": 0
    }

    Response:
    {
        "resolution": { ... },
        "settlement": { ... }
    }
    """
    admin_user = _get_admin_user(request)
    if admin_user is None:
        return _json_error("Admin access required", "UNAUTHORIZED", status=403)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return _json_error("Invalid JSON", "INVALID_JSON", status=400)

    winning_option_id = data.get("winning_option_id")
    winning_option_index = data.get("winning_option_index")

    if winning_option_id is None and winning_option_index is None:
        return _json_error(
            "winning_option_id or winning_option_index is required",
            "MISSING_PARAM",
            status=400,
        )

    try:
        result = resolve_and_settle_market(
            market_id=market_id,
            winning_option_id=str(winning_option_id) if winning_option_id else None,
            winning_option_index=int(winning_option_index) if winning_option_index is not None else None,
            settled_by_user_id=str(admin_user.id),
        )
        return JsonResponse(result)
    except SettlementError as e:
        return _json_error(str(e), e.code, status=e.http_status)
    except Exception as e:
        logger.exception("Error resolve-and-settle market %s: %s", market_id, e)
        return _json_error("Internal server error", "INTERNAL_ERROR", status=500)


@csrf_exempt
@require_http_methods(["GET"])
def admin_get_pool_info(request, event_id: str) -> JsonResponse:
    """
    GET /api/admin/events/<event_id>/pool/

    Get AMM pool info for an event (including pool_cash and collateral_amount).
    """
    admin_user = _get_admin_user(request)
    if admin_user is None:
        return _json_error("Admin access required", "UNAUTHORIZED", status=403)

    try:
        # Try event-level pool first
        pool = AmmPool.objects.filter(event_id=event_id).first()
        if not pool:
            # Try market-level pool
            event = Event.objects.filter(pk=event_id).first()
            if event:
                markets = Market.objects.filter(event_id=event_id)
                for market in markets:
                    pool = AmmPool.objects.filter(market_id=market.id).first()
                    if pool:
                        break

        if not pool:
            return _json_error("Pool not found", "POOL_NOT_FOUND", status=404)

        return JsonResponse({
            "pool_id": str(pool.id),
            "event_id": str(pool.event_id) if pool.event_id else None,
            "market_id": str(pool.market_id) if pool.market_id else None,
            "pool_cash": str(pool.pool_cash),
            "collateral_amount": str(pool.collateral_amount),
            "funding_amount": str(pool.funding_amount),
            "collected_fee": str(pool.collected_fee),
            "status": pool.status,
            "collateral_token": pool.collateral_token,
        })
    except Exception as e:
        logger.exception("Error getting pool info for event %s: %s", event_id, e)
        return _json_error("Internal server error", "INTERNAL_ERROR", status=500)


@csrf_exempt
@require_http_methods(["POST"])
def admin_add_collateral(request, event_id: str) -> JsonResponse:
    """
    POST /api/admin/events/<event_id>/pool/add-collateral/

    Add collateral to an AMM pool for settlement.

    Request body:
    {
        "amount": "1000.00"
    }
    """
    admin_user = _get_admin_user(request)
    if admin_user is None:
        return _json_error("Admin access required", "UNAUTHORIZED", status=403)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return _json_error("Invalid JSON", "INVALID_JSON", status=400)

    amount_str = data.get("amount")
    if not amount_str:
        return _json_error("amount is required", "MISSING_PARAM", status=400)

    try:
        amount = Decimal(str(amount_str))
        if amount <= 0:
            return _json_error("amount must be positive", "INVALID_PARAM", status=400)
    except Exception:
        return _json_error("Invalid amount format", "INVALID_PARAM", status=400)

    try:
        with transaction.atomic():
            # Try event-level pool first
            pool = AmmPool.objects.select_for_update().filter(event_id=event_id).first()
            if not pool:
                # Try market-level pool
                event = Event.objects.filter(pk=event_id).first()
                if event:
                    markets = Market.objects.filter(event_id=event_id)
                    for market in markets:
                        pool = AmmPool.objects.select_for_update().filter(market_id=market.id).first()
                        if pool:
                            break

            if not pool:
                return _json_error("Pool not found", "POOL_NOT_FOUND", status=404)

            # Add collateral
            pool.collateral_amount = Decimal(pool.collateral_amount) + amount
            pool.updated_at = timezone.now()
            pool.save(update_fields=["collateral_amount", "updated_at"])

            logger.info(
                "Added collateral to pool %s: amount=%s, new_total=%s",
                pool.id, amount, pool.collateral_amount
            )

            return JsonResponse({
                "pool_id": str(pool.id),
                "added_amount": str(amount),
                "new_collateral_amount": str(pool.collateral_amount),
                "pool_cash": str(pool.pool_cash),
            })
    except Exception as e:
        logger.exception("Error adding collateral for event %s: %s", event_id, e)
        return _json_error("Internal server error", "INTERNAL_ERROR", status=500)


@require_http_methods(["GET"])
def admin_list_users(request) -> JsonResponse:
    """
    GET /api/admin/users/
    List all users with their roles. Superadmin only.
    Supports pagination: ?page=1&page_size=20&search=xxx
    """
    admin_user = _get_superadmin_user(request)
    if admin_user is None:
        return _json_error("Superadmin access required", "UNAUTHORIZED", status=403)

    search = request.GET.get("search", "").strip()
    try:
        page = max(int(request.GET.get("page", 1)), 1)
        page_size = min(max(int(request.GET.get("page_size", 20)), 1), 100)
    except (TypeError, ValueError):
        page, page_size = 1, 20

    users_qs = User.objects.all().order_by("-created_at")
    if search:
        users_qs = users_qs.filter(display_name__icontains=search)

    total = users_qs.count()
    offset = (page - 1) * page_size
    users = [
        {
            "id": str(u.id),
            "display_name": u.display_name,
            "email": u.email,
            "role": u.role,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users_qs[offset:offset + page_size]
    ]
    return JsonResponse({"users": users, "total": total, "page": page, "page_size": page_size})


@csrf_exempt
@require_http_methods(["POST"])
def admin_update_user_role(request, user_id: str) -> JsonResponse:
    """
    POST /api/admin/users/<user_id>/role/
    Update a user's role. Superadmin only.
    Can only set role to 'user' or 'admin', not 'superadmin'.
    """
    admin_user = _get_superadmin_user(request)
    if admin_user is None:
        return _json_error("Superadmin access required", "UNAUTHORIZED", status=403)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return _json_error("Invalid JSON", "INVALID_JSON", status=400)

    new_role = data.get("role")
    if new_role not in (UserRole.USER, UserRole.ADMIN):
        return _json_error("Role must be 'user' or 'admin'", "INVALID_ROLE", status=400)

    try:
        target_user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return _json_error("User not found", "USER_NOT_FOUND", status=404)

    if target_user.role == UserRole.SUPERADMIN:
        return _json_error("Cannot modify superadmin role", "FORBIDDEN", status=403)

    old_role = target_user.role
    target_user.role = new_role
    target_user.updated_at = timezone.now()
    target_user.save(update_fields=["role", "updated_at"])

    # Audit log
    logger.info(
        "ROLE_CHANGE: admin=%s changed user=%s (%s) role from %s to %s",
        admin_user.id, target_user.id, target_user.display_name, old_role, new_role
    )

    return JsonResponse({
        "id": str(target_user.id),
        "display_name": target_user.display_name,
        "role": target_user.role,
        "old_role": old_role,
    })
