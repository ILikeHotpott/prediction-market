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
    AmmPoolOptionState,
    BalanceSnapshot,
    Event,
    Market,
    MarketOption,
    MarketOptionStats,
    MarketSettlement,
    Position,
)
from .execution import _recompute_option_probs
from ..cache import invalidate_on_market_change, invalidate_pool_state

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


def _is_no_option(market: Market, option: MarketOption) -> bool:
    side = (option.side or "").strip().lower()
    if side:
        return side == "no"
    # Fallback: standard binary index ordering NO=0, YES=1
    return option.option_index == 0


def _set_resolved_option_stats(market: Market, winning_option: MarketOption, now) -> None:
    """
    For a resolved market, set winning option prob_bps=10000 and others=0.
    This avoids stale probabilities after resolution.
    """
    stats_rows = list(MarketOptionStats.objects.select_for_update().filter(market=market))
    if not stats_rows:
        return

    for row in stats_rows:
        row.prob_bps = 10000 if row.option_id == winning_option.id else 0
        row.updated_at = now

    MarketOptionStats.objects.bulk_update(stats_rows, ["prob_bps", "updated_at"])


def _refresh_exclusive_pool_probs(pool: AmmPool, now) -> None:
    """
    Recompute probabilities for active options in an exclusive event pool.
    Resolved/canceled markets are excluded to renormalize remaining outcomes.
    """
    if pool is None:
        return

    try:
        b = float(pool.b)
    except Exception:
        return

    if b <= 0:
        return

    option_states = list(
        AmmPoolOptionState.objects.select_related("option", "option__market")
        .filter(pool=pool)
        .exclude(option__market__status__in=["resolved", "canceled"])
        .order_by("option__option_index", "option_id")
    )
    if not option_states:
        return

    _recompute_option_probs(option_states, b, now, is_exclusive=True)


def _sync_event_status_for_partial(event_id: str, now) -> Event:
    """
    Ensure event.status only flips to resolved when all markets are resolved/canceled.
    If event was mistakenly resolved while unresolved markets remain, revert it.
    """
    event = Event.objects.select_for_update().get(pk=event_id)
    unresolved_exists = Market.objects.filter(event_id=event_id).exclude(
        status__in=["resolved", "canceled"]
    ).exists()

    if unresolved_exists:
        if event.status == "resolved":
            fallback_status = "active"
            if event.trading_deadline and event.trading_deadline <= now:
                fallback_status = "closed"
            event.status = fallback_status
            event.resolved_at = None
            event.resolved_market_id = None
            event.updated_at = now
            event.save(update_fields=["status", "resolved_at", "resolved_market_id", "updated_at"])
        return event

    if event.status != "resolved":
        event.status = "resolved"
        event.resolved_at = now
        resolved_market_id = None
        if (event.group_rule or "").strip().lower() == "exclusive":
            resolved_markets = list(
                Market.objects.filter(event_id=event_id, status="resolved")
                .values_list("id", "resolved_option_index")
            )
            for market_id, resolved_index in resolved_markets:
                opt = MarketOption.objects.filter(
                    market_id=market_id, option_index=resolved_index
                ).only("side", "option_index").first()
                if opt and ((opt.side or "").strip().lower() == "yes" or opt.option_index == 1):
                    resolved_market_id = market_id
                    break

        event.resolved_market_id = resolved_market_id
        event.updated_at = now
        event.save(update_fields=["status", "resolved_at", "resolved_market_id", "updated_at"])

    return event


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


def _resolve_market_internal(
    *,
    market_id: str,
    winning_option_id: Optional[str] = None,
    winning_option_index: Optional[int] = None,
    resolved_by_user_id: Optional[str] = None,
    skip_status_update: bool = False,
) -> Dict:
    """
    Internal function to mark a market as resolved with a winning option.
    Does NOT have its own transaction - caller must wrap in transaction.atomic().

    Args:
        market_id: UUID of the market to resolve
        winning_option_id: ID of the winning option (provide one of id or index)
        winning_option_index: Index of the winning option
        resolved_by_user_id: Optional user who triggered the resolution
        skip_status_update: If True, don't update market/event status (used by resolve_and_settle)

    Returns:
        Dict with resolution details
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

    if market.status == "resolved" and market.settled_at is not None:
        # Already resolved AND settled - return current state (idempotent)
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

    if market.status not in ("active", "closed", "resolved"):
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

    # Only update resolved_option_index, NOT status (status updated after settlement succeeds)
    market.resolved_at = now
    market.resolved_option_index = winning_option.option_index
    market.updated_at = now

    if skip_status_update:
        # Don't change status yet - will be set to resolved after settlement succeeds
        market.save(update_fields=["resolved_at", "resolved_option_index", "updated_at"])
    else:
        # Standalone resolve call - set status to resolved
        market.status = "resolved"
        market.save(update_fields=["status", "resolved_at", "resolved_option_index", "updated_at"])

        # Also update event status if applicable
        if market.event_id:
            Event.objects.filter(pk=market.event_id).update(
                status="resolved",
                resolved_at=now,
                resolved_market_id=market.id,
                updated_at=now,
            )

        # Update option stats to reflect resolution
        _set_resolved_option_stats(market, winning_option, now)

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
def resolve_market(
    *,
    market_id: str,
    winning_option_id: Optional[str] = None,
    winning_option_index: Optional[int] = None,
    resolved_by_user_id: Optional[str] = None,
) -> Dict:
    """
    Mark a market as resolved with a winning option.

    NOTE: This only marks the winning option. To pay out winners, call settle_market().
    For atomic resolve + settle, use resolve_and_settle_market().

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
    return _resolve_market_internal(
        market_id=market_id,
        winning_option_id=winning_option_id,
        winning_option_index=winning_option_index,
        resolved_by_user_id=resolved_by_user_id,
        skip_status_update=False,
    )


def _settle_market_internal(
    *,
    market_id: str,
    settlement_tx_id: Optional[str] = None,
    settled_by_user_id: Optional[str] = None,
    market: Optional[Market] = None,
    update_market_status: bool = False,
    update_event_status: bool = False,
    close_pool: bool = True,
) -> Dict:
    """
    Internal function to pay out winners for a resolved market.
    Does NOT have its own transaction - caller must wrap in transaction.atomic().

    Args:
        market_id: UUID of the market to settle
        settlement_tx_id: Optional unique ID for idempotency (auto-generated if not provided)
        settled_by_user_id: Optional user who triggered the settlement
        market: Optional pre-locked market object (to avoid re-locking)
        update_market_status: If True, set market.status to resolved after settlement
        update_event_status: If True, update event status to resolved after settlement
        close_pool: If True, set pool.status to closed after settlement

    Returns:
        Dict with settlement details
    """
    if settlement_tx_id is None:
        settlement_tx_id = _generate_settlement_tx_id()

    if market is None:
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

    # For resolve_and_settle, market may not be in 'resolved' status yet
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

    # Determine funding sources BEFORE locking positions
    pool_cash = Decimal(pool.pool_cash)
    collateral_amount = Decimal(pool.collateral_amount)
    token = pool.collateral_token
    now = timezone.now()

    # FIX: Lock order must match execution.py: Pool -> Balance -> Position
    # First, get winning positions WITHOUT lock to calculate total payout
    winning_positions_info = list(
        Position.objects.filter(market=market, option=winning_option, shares__gt=0)
        .values("id", "user_id", "shares")
    )

    total_winning_shares = sum(Decimal(str(p["shares"])) for p in winning_positions_info)
    total_payout = total_winning_shares

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
                    f"Insufficient funds: need {remaining} more but only {collateral_amount} collateral available. "
                    f"pool_cash={pool_cash}, total_payout={total_payout}. "
                    f"Please add more collateral using the admin API.",
                    code="INSUFFICIENT_FUNDS",
                    http_status=400,
                )
            collateral_used = remaining

    # FIX: Now lock balances first (matching execution.py lock order), then positions
    # Collect all user_ids that need balance updates
    user_ids = [p["user_id"] for p in winning_positions_info]

    # Lock all balance rows first (create if needed)
    balance_map = {}
    for user_id in user_ids:
        bal = BalanceSnapshot.objects.select_for_update().filter(
            user_id=user_id, token=token
        ).first()
        if bal is None:
            try:
                bal = BalanceSnapshot.objects.create(
                    user_id=user_id,
                    token=token,
                    available_amount=Decimal("0"),
                    locked_amount=Decimal("0"),
                    updated_at=now,
                )
            except IntegrityError:
                bal = BalanceSnapshot.objects.select_for_update().get(
                    user_id=user_id, token=token
                )
        balance_map[user_id] = bal

    # Now lock positions (after balances, matching execution.py order)
    winning_positions = list(
        Position.objects.select_for_update()
        .filter(market=market, option=winning_option, shares__gt=0)
    )

    # FIX: Batch update balances using F() for atomicity
    payouts = []
    for position in winning_positions:
        payout_amount = Decimal(position.shares)
        if payout_amount <= 0:
            continue

        # Use F() expression for atomic update
        BalanceSnapshot.objects.filter(
            user_id=position.user_id, token=token
        ).update(
            available_amount=F("available_amount") + payout_amount,
            updated_at=now,
        )

        payouts.append({
            "user_id": str(position.user_id),
            "shares": str(position.shares),
            "payout": str(payout_amount),
        })

    # Update pool balances
    pool.pool_cash = pool_cash - pool_cash_used
    pool.collateral_amount = collateral_amount - collateral_used
    if close_pool:
        pool.status = "closed"
    pool.updated_at = now
    pool_update_fields = ["pool_cash", "collateral_amount", "updated_at"]
    if close_pool:
        pool_update_fields.append("status")
    pool.save(update_fields=pool_update_fields)

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

    # Update market - NOW set status to resolved (after successful payout if requested)
    market.settled_at = now
    market.settlement_tx_id = settlement_tx_id
    market.updated_at = now

    if update_market_status:
        # Set status to resolved now
        market.status = "resolved"
        market.save(update_fields=["status", "settled_at", "settlement_tx_id", "updated_at"])

        # Update option stats to reflect resolution
        _set_resolved_option_stats(market, winning_option, now)

        # Also update event status if requested
        if update_event_status and market.event_id:
            Event.objects.filter(pk=market.event_id).update(
                status="resolved",
                resolved_at=now,
                resolved_market_id=market.id,
                updated_at=now,
            )
    else:
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
    # First check market status
    try:
        market = Market.objects.select_for_update().get(pk=market_id)
    except Market.DoesNotExist:
        raise SettlementError("Market not found", code="MARKET_NOT_FOUND", http_status=404)

    if market.status != "resolved":
        raise SettlementError(
            f"Market must be resolved before settlement (current status: {market.status})",
            code="NOT_RESOLVED",
            http_status=400,
        )

    return _settle_market_internal(
        market_id=market_id,
        settlement_tx_id=settlement_tx_id,
        settled_by_user_id=settled_by_user_id,
        market=market,
        update_market_status=False,
        update_event_status=False,
        close_pool=True,
    )


@transaction.atomic
def resolve_and_settle_market_partial(
    *,
    market_id: str,
    winning_option_id: Optional[str] = None,
    winning_option_index: Optional[int] = None,
    settled_by_user_id: Optional[str] = None,
) -> Dict:
    """
    Partial resolve + settle for exclusive/independent events.

    - Does NOT update event.status to resolved.
    - For exclusive events, only NO outcomes are allowed and the pool remains active.
    """
    if winning_option_id is None and winning_option_index is None:
        raise SettlementError(
            "winning_option_id or winning_option_index is required",
            code="INVALID_PARAM",
            http_status=400,
        )

    try:
        market = Market.objects.select_related("event").get(pk=market_id)
    except Market.DoesNotExist:
        raise SettlementError("Market not found", code="MARKET_NOT_FOUND", http_status=404)

    event = market.event
    if event is None:
        raise SettlementError(
            "Partial settlement requires an event",
            code="EVENT_NOT_FOUND",
            http_status=400,
        )

    group_rule = (event.group_rule or "").strip().lower()
    if group_rule not in ("exclusive", "independent"):
        raise SettlementError(
            "Partial settlement is only supported for exclusive/independent events",
            code="INVALID_GROUP_RULE",
            http_status=400,
        )

    try:
        if winning_option_id:
            winning_option = MarketOption.objects.get(pk=winning_option_id, market=market)
        else:
            winning_option = MarketOption.objects.get(option_index=winning_option_index, market=market)
    except MarketOption.DoesNotExist:
        raise SettlementError("Winning option not found for market", code="OPTION_NOT_FOUND", http_status=404)

    if not winning_option.is_active:
        raise SettlementError("Winning option is not active", code="OPTION_NOT_ACTIVE", http_status=400)

    if group_rule == "exclusive" and not _is_no_option(market, winning_option):
        raise SettlementError(
            "Exclusive events can only partially settle a NO outcome",
            code="INVALID_PARTIAL_OPTION",
            http_status=400,
        )

    resolve_result = _resolve_market_internal(
        market_id=market_id,
        winning_option_id=str(winning_option.id),
        winning_option_index=None,
        resolved_by_user_id=settled_by_user_id,
        skip_status_update=True,
    )

    if (
        resolve_result.get("already_resolved")
        and resolve_result.get("resolved_option_index") != winning_option.option_index
    ):
        raise SettlementError(
            "Market already resolved with a different outcome",
            code="ALREADY_RESOLVED",
            http_status=409,
        )

    settle_result = _settle_market_internal(
        market_id=market_id,
        settled_by_user_id=settled_by_user_id,
        update_market_status=True,
        update_event_status=False,
        close_pool=(group_rule != "exclusive"),
    )

    now = timezone.now()
    if group_rule == "exclusive":
        pool = AmmPool.objects.select_for_update().filter(event_id=event.id).first()
        _refresh_exclusive_pool_probs(pool, now)

    _sync_event_status_for_partial(str(event.id), now)

    event_market_ids = []
    if group_rule == "exclusive":
        event_market_ids = list(
            Market.objects.filter(event_id=event.id).values_list("id", flat=True)
        )

    def _invalidate_cache():
        invalidate_on_market_change(str(market.id), str(event.id))
        for mid in event_market_ids:
            invalidate_pool_state(str(mid))

    transaction.on_commit(_invalidate_cache)

    return {
        "resolution": resolve_result,
        "settlement": settle_result,
    }


@transaction.atomic
def resolve_and_settle_market(
    *,
    market_id: str,
    winning_option_id: Optional[str] = None,
    winning_option_index: Optional[int] = None,
    settled_by_user_id: Optional[str] = None,
) -> Dict:
    """
    Resolve and settle a market in one ATOMIC transaction.

    This ensures that if settlement fails (e.g., insufficient funds),
    the market status will NOT be changed to 'resolved'.
    Status is only set to 'resolved' AFTER all payouts are successfully completed.

    Args:
        market_id: UUID of the market
        winning_option_id: ID of the winning option
        winning_option_index: Index of the winning option (alternative to id)
        settled_by_user_id: User performing the operation

    Returns:
        Dict with both resolution and settlement details
    """
    # Step 1: Resolve (but don't update status yet)
    resolve_result = _resolve_market_internal(
        market_id=market_id,
        winning_option_id=winning_option_id,
        winning_option_index=winning_option_index,
        resolved_by_user_id=settled_by_user_id,
        skip_status_update=True,  # Don't set status to resolved yet
    )

    # Step 2: Settle and update status to resolved (only if settlement succeeds)
    settle_result = _settle_market_internal(
        market_id=market_id,
        settled_by_user_id=settled_by_user_id,
        update_market_status=True,  # Set status to resolved after successful payout
        update_event_status=True,
        close_pool=True,
    )

    return {
        "resolution": resolve_result,
        "settlement": settle_result,
    }
