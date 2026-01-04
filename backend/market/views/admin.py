"""
Admin views for market resolution and settlement.

These endpoints are intended for admin users only.
"""

import json
import logging
from typing import Optional

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import User
from ..services.amm.settlement import (
    SettlementError,
    resolve_and_settle_market,
    resolve_market,
    settle_market,
)

logger = logging.getLogger(__name__)


def _get_admin_user(request) -> Optional[User]:
    """Extract admin user from request. Returns None if not authenticated or not admin."""
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
