"""
Settlement service for prediction market resolution and payout.

This module provides:
- resolve_market(): Mark a market as resolved with a winning option
- settle_market(): Pay out winners from pool_cash + collateral

Key design decisions:
- Idempotent via settlement_tx_id unique constraint on MarketSettlement
- Concurrency-safe via SELECT FOR UPDATE row locking
- Settlement uses pool_cash first, then collateral_amount for shortfall
- Each winning share pays out 1 unit of collateral token
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from django.db import IntegrityError, transaction
from django.db.models import F, Sum
from django.utils import timezone

from ...models import (
    AmmPool,
    BalanceSnapshot,
    Event,
    Market,
    MarketOption,
    MarketSettlement,
    Position,
)

logger = logging.getLogger(__name__)

# Precision for settlement calculations
MONEY_QUANT = Decimal("0.000000000000000001")


class SettlementError(ValueError):
    """Raised when settlement fails."""

    def __init__(self, message: str, *, code: str = "SETTLEMENT_ERROR", http_status: int = 400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status

    def to_payload(self) -> Dict:
        return {"error": str(self), "code": self.code}


def _generate_settlement_tx_id() -> str:
    """Generate a unique settlement transaction ID."""
    return f"settle:{uuid.uuid4()}"


def _get_pool_for_market(market: Market) -> Optional[AmmPool]:
    """
    Get the AMM pool for a market.
    For exclusive events, the pool is at event level.
    """
    # Try market-level pool first
    pool = AmmPool.objects.filter(market=market).first()
    if pool:
        return pool

    # Try event-level pool (exclusive events)
    if market.event_id:
        pool = AmmPool.objects.filter(event_id=market.event_id).first()
        if pool:
            return pool

    return None


@transaction.atomic
def resolve_market(
    *,
    market_id: str,
    winning_option_id: Optional[str] = None,
    winning_option_index: Optional[int] = None,
    resolved_by_user_id: Optional[str] = None,
) -> Dict:
    """
    Mark a market as resolved with a winning option.

    This sets:
    - market.status = 'resolved'
    - market.resolved_at = now
    - market.resolved_option_index = winning option's index

    Args:
        market_id: UUID of the market to resolve
        winning_option_id: ID of the winning option (provide one of id or index)
        winning_option_index: Index of the winning option
        resolved_by_user_id: Optional user who triggered the resolution

    Returns:
        Dict with resolution details

    Raises:
        SettlementError: If market not found, already resolved, or invalid option
    """
    if winning_option_id is None and winning_option_index is None:
        raise SettlementError(
            "winning_option_id or winning_option_index is required",
            code="INVALID_PARAM",
            http_status=400,
        )

    try:
        market = Market.objects.select_for_update().get(pk=market_id)
    except Market.DoesNotExist:
        raise SettlementError("Market not found", code="MARKET_NOT_FOUND", http_status=404)

    if market.status == "resolved":
        # Already resolved - return current state (idempotent)
        winning_opt = MarketOption.objects.filter(
            market=market, option_index=market.resolved_option_index
        ).first()
        return {
            "market_id": str(market.id),
            "status": market.status,
            "resolved_at": market.resolved_at.isoformat() if market.resolved_at else None,
            "resolved_option_index": market.resolved_option_index,
            "resolved_option_id": winning_opt.id if winning_opt else None,
            "already_resolved": True,
        }

    if market.status not in ("active", "closed"):
        raise SettlementError(
            f"Market cannot be resolved from status '{market.status}'",
            code="INVALID_STATUS",
            http_status=400,
        )

    # Find the winning option
    try:
        if winning_option_id:
            winning_option = MarketOption.objects.get(pk=winning_option_id, market=market)
        else:
            winning_option = MarketOption.objects.get(option_index=winning_option_index, market=market)
    except MarketOption.DoesNotExist:
        raise SettlementError("Winning option not found for market", code="OPTION_NOT_FOUND", http_status=404)

    if not winning_option.is_active:
        raise SettlementError("Winning option is not active", code="OPTION_NOT_ACTIVE", http_status=400)

    now = timezone.now()

    # Update market
    market.status = "resolved"
    market.resolved_at = now
    market.resolved_option_index = winning_option.option_index
    market.updated_at = now
    market.save(update_fields=["status", "resolved_at", "resolved_option_index", "updated_at"])

    # Also update event status if applicable
    if market.event_id:
        Event.objects.filter(pk=market.event_id).update(
            status="resolved",
            resolved_at=now,
            resolved_market_id=market.id,
            updated_at=now,
        )

    logger.info(
        "Market resolved: market_id=%s, winning_option_id=%s, winning_option_index=%s",
        market_id,
        winning_option.id,
        winning_option.option_index,
    )

    return {
        "market_id": str(market.id),
        "status": market.status,
        "resolved_at": market.resolved_at.isoformat(),
        "resolved_option_index": market.resolved_option_index,
        "resolved_option_id": winning_option.id,
        "already_resolved": False,
    }


@transaction.atomic
def settle_market(
    *,
    market_id: str,
    settlement_tx_id: Optional[str] = None,
    settled_by_user_id: Optional[str] = None,
) -> Dict:
    """
    Pay out winners for a resolved market.

    Settlement payout per winning share = 1 unit of collateral token.
    Funding source priority: pool_cash first, then collateral_amount.

    Idempotent: If settlement_tx_id already exists for this market, returns existing record.

    Args:
        market_id: UUID of the market to settle
        settlement_tx_id: Optional unique ID for idempotency (auto-generated if not provided)
        settled_by_user_id: Optional user who triggered the settlement

    Returns:
        Dict with settlement details

    Raises:
        SettlementError: If market not resolved, already settled, or insufficient funds
    """
    if settlement_tx_id is None:
        settlement_tx_id = _generate_settlement_tx_id()

    try:
        market = Market.objects.select_for_update().get(pk=market_id)
    except Market.DoesNotExist:
        raise SettlementError("Market not found", code="MARKET_NOT_FOUND", http_status=404)

    # Check if already settled
    if market.settled_at is not None:
        existing = MarketSettlement.objects.filter(market=market).first()
        if existing:
            return {
                "market_id": str(market.id),
                "settlement_tx_id": existing.settlement_tx_id,
                "total_payout": str(existing.total_payout),
                "pool_cash_used": str(existing.pool_cash_used),
                "collateral_used": str(existing.collateral_used),
                "settled_at": existing.settled_at.isoformat(),
                "already_settled": True,
            }

    if market.status != "resolved":
        raise SettlementError(
            f"Market must be resolved before settlement (current status: {market.status})",
            code="NOT_RESOLVED",
            http_status=400,
        )

    if market.resolved_option_index is None:
        raise SettlementError("Market has no resolved option", code="NO_RESOLVED_OPTION", http_status=400)

    # Find the winning option
    try:
        winning_option = MarketOption.objects.get(
            market=market, option_index=market.resolved_option_index
        )
    except MarketOption.DoesNotExist:
        raise SettlementError("Winning option not found", code="OPTION_NOT_FOUND", http_status=404)

    # Get the pool
    pool = _get_pool_for_market(market)
    if pool is None:
        raise SettlementError("AMM pool not found for market", code="POOL_NOT_FOUND", http_status=404)

    # Lock the pool
    pool = AmmPool.objects.select_for_update().get(pk=pool.id)

    # Calculate total payout needed
    # Get all winning positions (shares > 0 for the winning option)
    winning_positions = list(
        Position.objects.select_for_update()
        .filter(market=market, option=winning_option, shares__gt=0)
    )

    total_winning_shares = sum(Decimal(p.shares) for p in winning_positions)
    # Each share pays out 1 unit of collateral
    total_payout = total_winning_shares

    # Determine funding sources
    pool_cash = Decimal(pool.pool_cash)
    collateral_amount = Decimal(pool.collateral_amount)

    pool_cash_used = Decimal("0")
    collateral_used = Decimal("0")

    if total_payout > 0:
        # Use pool_cash first
        pool_cash_used = min(pool_cash, total_payout)
        remaining = total_payout - pool_cash_used

        # Use collateral for any shortfall
        if remaining > 0:
            if remaining > collateral_amount:
                raise SettlementError(
                    f"Insufficient funds: need {remaining} more but only {collateral_amount} collateral available",
                    code="INSUFFICIENT_FUNDS",
                    http_status=400,
                )
            collateral_used = remaining

    now = timezone.now()
    token = pool.collateral_token

    # Pay out to winners
    payouts: List[Dict] = []
    for position in winning_positions:
        payout_amount = Decimal(position.shares)
        if payout_amount <= 0:
            continue

        # Credit user's balance
        bal = BalanceSnapshot.objects.select_for_update().filter(
            user_id=position.user_id, token=token
        ).first()

        if bal is None:
            # Create balance record
            try:
                bal = BalanceSnapshot.objects.create(
                    user_id=position.user_id,
                    token=token,
                    available_amount=payout_amount,
                    locked_amount=Decimal("0"),
                    updated_at=now,
                )
            except IntegrityError:
                bal = BalanceSnapshot.objects.select_for_update().get(
                    user_id=position.user_id, token=token
                )
                bal.available_amount = Decimal(bal.available_amount) + payout_amount
                bal.updated_at = now
                bal.save(update_fields=["available_amount", "updated_at"])
        else:
            bal.available_amount = Decimal(bal.available_amount) + payout_amount
            bal.updated_at = now
            bal.save(update_fields=["available_amount", "updated_at"])

        payouts.append({
            "user_id": str(position.user_id),
            "shares": str(position.shares),
            "payout": str(payout_amount),
        })

    # Update pool balances
    pool.pool_cash = pool_cash - pool_cash_used
    pool.collateral_amount = collateral_amount - collateral_used
    pool.status = "closed"
    pool.updated_at = now
    pool.save(update_fields=["pool_cash", "collateral_amount", "status", "updated_at"])

    # Create settlement record (idempotent via unique constraint)
    try:
        settlement = MarketSettlement.objects.create(
            market=market,
            resolved_option=winning_option,
            total_payout=total_payout,
            pool_cash_used=pool_cash_used,
            collateral_used=collateral_used,
            settled_by_id=settled_by_user_id,
            settled_at=now,
            settlement_tx_id=settlement_tx_id,
        )
    except IntegrityError:
        # Settlement already exists (concurrent request)
        existing = MarketSettlement.objects.get(market=market)
        return {
            "market_id": str(market.id),
            "settlement_tx_id": existing.settlement_tx_id,
            "total_payout": str(existing.total_payout),
            "pool_cash_used": str(existing.pool_cash_used),
            "collateral_used": str(existing.collateral_used),
            "settled_at": existing.settled_at.isoformat(),
            "already_settled": True,
        }

    # Update market
    market.settled_at = now
    market.settlement_tx_id = settlement_tx_id
    market.updated_at = now
    market.save(update_fields=["settled_at", "settlement_tx_id", "updated_at"])

    logger.info(
        "Market settled: market_id=%s, tx_id=%s, total_payout=%s, pool_cash_used=%s, collateral_used=%s",
        market_id,
        settlement_tx_id,
        total_payout,
        pool_cash_used,
        collateral_used,
    )

    return {
        "market_id": str(market.id),
        "settlement_tx_id": settlement_tx_id,
        "winning_option_id": winning_option.id,
        "winning_option_index": winning_option.option_index,
        "total_payout": str(total_payout),
        "pool_cash_used": str(pool_cash_used),
        "collateral_used": str(collateral_used),
        "settled_at": now.isoformat(),
        "payouts_count": len(payouts),
        "already_settled": False,
    }


def resolve_and_settle_market(
    *,
    market_id: str,
    winning_option_id: Optional[str] = None,
    winning_option_index: Optional[int] = None,
    settled_by_user_id: Optional[str] = None,
) -> Dict:
    """
    Convenience function to resolve and settle a market in one call.

    Args:
        market_id: UUID of the market
        winning_option_id: ID of the winning option
        winning_option_index: Index of the winning option (alternative to id)
        settled_by_user_id: User performing the operation

    Returns:
        Dict with both resolution and settlement details
    """
    resolve_result = resolve_market(
        market_id=market_id,
        winning_option_id=winning_option_id,
        winning_option_index=winning_option_index,
        resolved_by_user_id=settled_by_user_id,
    )

    settle_result = settle_market(
        market_id=market_id,
        settled_by_user_id=settled_by_user_id,
    )

    return {
        "resolution": resolve_result,
        "settlement": settle_result,
    }
