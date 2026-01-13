from decimal import Decimal, InvalidOperation
import logging
from typing import Dict, List, Optional, Tuple

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from ...models import (
    AmmPool,
    AmmPoolOptionState,
    BalanceSnapshot,
    Event,
    Market,
    MarketOption,
    MarketOptionSeries,
    MarketOptionStats,
    OrderIntent,
    Position,
    Trade,
    Wallet,
)
from .quote_core import quote_from_state
from .state import PoolState
from .lmsr import prices
from .money import _bps_from_probabilities
from .pool_utils import build_no_to_yes_mapping
from ..cache import invalidate_on_trade

logger = logging.getLogger(__name__)

Number = Decimal

# Money quantization for AMM calculations (cents in USD terms). Adjust as needed.
MONEY_QUANT = Decimal("0.01")

DEFAULT_TOKEN = "USDC"
DEFAULT_CHAIN = "evm"


class ExecutionError(ValueError):
    """
    Raised when execution fails (insufficient balance/shares, invalid params, etc.).
    Supports http_status + code for API mapping.
    """

    def __init__(self, message: str, *, code: str = "EXECUTION_ERROR", http_status: int = 400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status

    def to_payload(self) -> Dict:
        return {"error": str(self), "code": self.code}


def _to_decimal(raw, field_name: str) -> Decimal:
    try:
        v = Decimal(str(raw))
    except (InvalidOperation, TypeError):
        raise ExecutionError(f"{field_name} must be a decimal number", code="INVALID_PARAM", http_status=400)
    if v <= 0:
        raise ExecutionError(f"{field_name} must be > 0", code="INVALID_PARAM", http_status=400)
    return v


def _lock_pool_state(market_id: str) -> Tuple[AmmPool, List[AmmPoolOptionState], PoolState]:
    """
    Lock pool + option_state rows for a market and build PoolState.
    IMPORTANT: Must lock *all* option_state rows to prevent concurrent q drift.

    For exclusive events, the pool is at the event level, not market level.
    Also builds the no_to_yes_option_id mapping for exclusive events.
    """
    # Try market-level pool first (no select_related to avoid outer join with FOR UPDATE)
    pool = AmmPool.objects.select_for_update().filter(market_id=market_id).first()

    is_exclusive = False

    # If no market-level pool, check for event-level pool (exclusive events)
    if pool is None:
        try:
            market = Market.objects.select_related("event").get(pk=market_id)
            if market.event_id:
                pool = AmmPool.objects.select_for_update().filter(event_id=market.event_id).first()
                if pool is not None:
                    event = market.event
                    is_exclusive = (event.group_rule or "").strip().lower() == "exclusive"
        except Market.DoesNotExist:
            pass

    if pool is None:
        raise ExecutionError("AMM pool not found for market", code="POOL_NOT_FOUND", http_status=404)

    if pool.b is None or Decimal(pool.b) <= 0:
        raise ExecutionError("AMM pool liquidity parameter b is invalid", code="POOL_INVALID", http_status=422)

    states = list(
        AmmPoolOptionState.objects.select_for_update()
        .select_related("option")
        .filter(pool=pool)
        .order_by("option__option_index", "option_id")
    )
    if not states:
        raise ExecutionError("AMM pool has no option state", code="POOL_STATE_NOT_FOUND", http_status=404)

    option_ids: List[str] = []
    option_indexes: List[int] = []
    q: List[float] = []
    for s in states:
        option_ids.append(str(s.option_id))
        option_indexes.append(int(s.option.option_index))
        q.append(float(s.q))

    option_id_to_idx = {oid: i for i, oid in enumerate(option_ids)}

    # Build no_to_yes_option_id mapping for exclusive events (optimized single query)
    no_to_yes_option_id = build_no_to_yes_mapping(option_ids, option_id_to_idx) if is_exclusive else {}

    state = PoolState(
        market_id=str(market_id),  # Use the passed market_id, not pool.market_id (which is None for event pools)
        pool_id=str(pool.id),
        b=float(pool.b),
        fee_bps=int(pool.fee_bps or 0),
        option_ids=option_ids,
        option_indexes=option_indexes,
        q=q,
        option_id_to_idx=option_id_to_idx,
        option_index_to_idx={oi: i for i, oi in enumerate(option_indexes)},
        no_to_yes_option_id=no_to_yes_option_id,
        is_exclusive=is_exclusive,
    )
    return pool, states, state



def _lock_market_and_option(market_id: str, option_id: Optional[str], option_index: Optional[int]):
    now = timezone.now()

    try:
        # Lock only the Market table, not the Event (to avoid FOR UPDATE on nullable outer join)
        market = Market.objects.select_for_update().get(pk=market_id)
    except Market.DoesNotExist:
        raise ExecutionError("Market not found", code="MARKET_NOT_FOUND", http_status=404)

    # FIX: Lock Event row when checking status to prevent race condition
    event = None
    if market.event_id:
        event = Event.objects.select_for_update().filter(pk=market.event_id).first()
    if event and (event.status != "active" or event.is_hidden):
        raise ExecutionError("Event is not active", code="EVENT_NOT_ACTIVE", http_status=400)
    if market.status != "active" or market.is_hidden:
        raise ExecutionError("Market is not active", code="MARKET_NOT_ACTIVE", http_status=400)

    deadline = market.trading_deadline or (event.trading_deadline if event else None)
    if deadline and deadline <= now:
        raise ExecutionError("Trading deadline passed", code="MARKET_CLOSED", http_status=400)

    if not option_id and option_index is None:
        raise ExecutionError("option_id or option_index is required", code="INVALID_PARAM", http_status=400)

    try:
        if option_id:
            option = MarketOption.objects.select_for_update().get(pk=option_id, market=market)
        else:
            option = MarketOption.objects.select_for_update().get(option_index=option_index, market=market)
    except MarketOption.DoesNotExist:
        raise ExecutionError("Option not found for market", code="OPTION_NOT_FOUND", http_status=404)

    if not option.is_active:
        raise ExecutionError("Option is not active", code="OPTION_NOT_ACTIVE", http_status=400)

    return market, option, now


def _lock_balance(user_id, token: str, now):
    """
    Lock balance row. If missing, create it safely under concurrency.
    Assumes (user_id, token) is unique or effectively treated as unique.
    """
    bal = BalanceSnapshot.objects.select_for_update().filter(user_id=user_id, token=token).first()
    if bal:
        return bal

    # Concurrency-safe create using savepoint
    try:
        with transaction.atomic():
            return BalanceSnapshot.objects.create(
                user_id=user_id,
                token=token,
                available_amount=Decimal("0"),
                locked_amount=Decimal("0"),
                updated_at=now,
            )
    except IntegrityError:
        # Another tx created it first
        return BalanceSnapshot.objects.select_for_update().get(user_id=user_id, token=token)


def _lock_position(user_id, market_id, option_id, now):
    """
    Lock position row. If missing, create it safely under concurrency.
    Assumes (user_id, market_id, option_id) is unique or effectively treated as unique.
    """
    try:
        pos = Position.objects.select_for_update().get(user_id=user_id, market_id=market_id, option_id=option_id)
        return pos, False
    except Position.DoesNotExist:
        try:
            with transaction.atomic():
                pos = Position.objects.create(
                    user_id=user_id,
                    market_id=market_id,
                    option_id=option_id,
                    shares=Decimal("0"),
                    cost_basis=Decimal("0"),
                    created_at=now,
                    updated_at=now,
                )
                return pos, True
        except IntegrityError:
            pos = Position.objects.select_for_update().get(user_id=user_id, market_id=market_id, option_id=option_id)
            return pos, False


def _ensure_wallet(user, wallet_id: Optional[str], now):
    """
    Ensure a wallet exists to record OrderIntent/Trade.
    - If wallet_id provided but invalid -> error
    - Else prefer user's primary wallet, then any, else create a web2 placeholder
    """
    if wallet_id:
        w = Wallet.objects.filter(pk=wallet_id, user=user).first()
        if not w:
            raise ExecutionError("User wallet not found", code="WALLET_NOT_FOUND", http_status=400)
        return w

    primary_id = getattr(user, "primary_wallet_id", None)
    if primary_id:
        w = Wallet.objects.filter(pk=primary_id, user=user).first()
        if w:
            return w

    existing = Wallet.objects.filter(user=user).order_by("-is_primary", "id").first()
    if existing:
        return existing

    # Create placeholder wallet (web2)
    return Wallet.objects.create(
        user=user,
        chain_family="web2",
        address=f"web2-{user.id}",
        is_primary=True,
        created_at=now,
    )


def _update_option_probs(option_states: List[AmmPoolOptionState], post_prob_bps: List[int], now):
    """
    Update MarketOptionStats.prob_bps for display, using bulk_update (avoid N updates).
    Best-effort: if anything mismatches, do nothing rather than fail execution.
    """
    if not isinstance(post_prob_bps, list) or len(post_prob_bps) != len(option_states):
        return

    option_ids = [st.option_id for st in option_states]
    stats_rows = list(MarketOptionStats.objects.select_for_update().filter(option_id__in=option_ids))
    by_option = {s.option_id: s for s in stats_rows}

    to_update: List[MarketOptionStats] = []
    for st, prob in zip(option_states, post_prob_bps):
        row = by_option.get(st.option_id)
        if not row:
            continue
        row.prob_bps = int(prob)
        row.updated_at = now
        to_update.append(row)

    if to_update:
        MarketOptionStats.objects.bulk_update(to_update, ["prob_bps", "updated_at"])


def _update_no_option_probs(option_states: List[AmmPoolOptionState], yes_prob_bps: List[int], now):
    """
    For exclusive events, update the No options' prob_bps.
    Each No option's probability = 10000 - corresponding Yes option's probability.
    """
    if not option_states or not yes_prob_bps:
        return

    # Get the Yes option IDs and their market IDs
    yes_option_ids = [st.option_id for st in option_states]
    yes_options = list(MarketOption.objects.filter(id__in=yes_option_ids).values_list("id", "market_id"))
    yes_opt_to_market = {opt_id: market_id for opt_id, market_id in yes_options}
    market_ids = list(yes_opt_to_market.values())

    # Find No options in the same markets
    no_options = list(
        MarketOption.objects.filter(market_id__in=market_ids, side="no", is_active=True)
        .values_list("id", "market_id")
    )
    if not no_options:
        return

    # Build market_id -> yes_prob_bps mapping
    market_to_yes_prob = {}
    for st, prob in zip(option_states, yes_prob_bps):
        market_id = yes_opt_to_market.get(st.option_id)
        if market_id:
            market_to_yes_prob[market_id] = prob

    # Get No option stats and update
    no_option_ids = [opt_id for opt_id, _ in no_options]
    no_stats_rows = list(MarketOptionStats.objects.select_for_update().filter(option_id__in=no_option_ids))
    no_opt_to_market = {opt_id: market_id for opt_id, market_id in no_options}

    to_update: List[MarketOptionStats] = []
    for row in no_stats_rows:
        market_id = no_opt_to_market.get(row.option_id)
        if market_id and market_id in market_to_yes_prob:
            row.prob_bps = 10000 - market_to_yes_prob[market_id]
            row.updated_at = now
            to_update.append(row)

    if to_update:
        MarketOptionStats.objects.bulk_update(to_update, ["prob_bps", "updated_at"])


def _recompute_option_probs(option_states: List[AmmPoolOptionState], b: float, now, is_exclusive: bool = False):
    """
    Compute probabilities from the latest on-chain-style q (after writes) and persist
    to MarketOptionStats. Best-effort; failures should not abort the trade.

    For exclusive events, also updates the No options (prob = 10000 - yes_prob).
    """
    try:
        q = [float(getattr(st, "q", 0)) for st in option_states]
        probs = prices(q, float(b))
        prob_bps = _bps_from_probabilities(probs)
    except Exception as e:
        logger.warning("Failed to compute option probabilities: %s", e)
        return

    _update_option_probs(option_states, prob_bps, now)

    # For exclusive events, update No options as well
    if is_exclusive:
        _update_no_option_probs(option_states, prob_bps, now)

    # Record price history
    _record_price_series(option_states, prob_bps, now)


def _update_stats_volume(option_id: str, amount_delta: Decimal, now):
    """
    Update volume stats for the traded option.
    Uses F() expressions for atomic updates on high-traffic rows.
    """
    MarketOptionStats.objects.filter(option_id=option_id).update(
        volume_total=F("volume_total") + amount_delta,
        volume_24h=F("volume_24h") + amount_delta,
        last_trade_at=now,
        updated_at=now,
    )


def _record_price_series(option_states: List[AmmPoolOptionState], prob_bps: List[int], now):
    """
    Record price history to market_option_series table.
    Best-effort; failures should not abort the trade.

    Uses 5-second buckets to avoid spikes from rapid trades.
    """
    try:
        # Round to 5-second bucket to avoid spikes
        bucket = now.replace(microsecond=0)
        second = (bucket.second // 5) * 5
        bucket = bucket.replace(second=second)

        rows = []
        for st, prob in zip(option_states, prob_bps):
            opt = st.option
            rows.append(MarketOptionSeries(
                option_id=opt.id,
                market_id=opt.market_id,
                interval="1M",
                bucket_start=bucket,
                value_bps=prob,
            ))

        if rows:
            # Use update_conflicts to update existing bucket with latest price
            MarketOptionSeries.objects.bulk_create(
                rows,
                update_conflicts=True,
                unique_fields=["option_id", "interval", "bucket_start"],
                update_fields=["value_bps"],
            )
    except Exception as e:
        logger.warning("Failed to record price series: %s", e)
        # Best-effort, don't fail the trade


def execute_buy(
    *,
    user,
    market_id,
    option_id: Optional[str],
    option_index: Optional[int],
    amount_in: Number,
    token: str = DEFAULT_TOKEN,
    wallet_id: Optional[str] = None,
    client_nonce: Optional[str] = None,
    money_quant: Decimal = MONEY_QUANT,
    min_shares_out: Optional[Number] = None,
    max_slippage_bps: Optional[int] = None,
) -> Dict:
    """
    Execute a BUY against the AMM with full locking and persistence.

    LOCK ORDER (must be consistent across all execute_*):
      1) Market + Option (FOR UPDATE)
      2) AmmPoolOptionState rows (FOR UPDATE)
      3) BalanceSnapshot (FOR UPDATE)
      4) Position (FOR UPDATE)
    """
    amt = _to_decimal(amount_in, "amount_in")
    min_shares_dec = _to_decimal(min_shares_out, "min_shares_out") if min_shares_out is not None else None

    max_slippage_bps_int: Optional[int] = None
    if max_slippage_bps is not None:
        try:
            max_slippage_bps_int = int(max_slippage_bps)
        except (TypeError, ValueError):
            raise ExecutionError("max_slippage_bps must be an integer", code="INVALID_PARAM", http_status=400)
        if max_slippage_bps_int < 0:
            raise ExecutionError("max_slippage_bps must be >= 0", code="INVALID_PARAM", http_status=400)

    with transaction.atomic():
        market, option, now = _lock_market_and_option(market_id, option_id, option_index)
        pool, option_states, pool_state = _lock_pool_state(market_id)

        # Detect if this is a No option in an exclusive event
        is_no_side = False
        target_option_id = str(option.id)
        if target_option_id in pool_state.no_to_yes_option_id:
            is_no_side = True
            # Map to the Yes option for LSMR calculation
            yes_opt_id, mapped_idx = pool_state.no_to_yes_option_id[target_option_id]
            # FIX: Validate mapping consistency
            if yes_opt_id not in pool_state.option_id_to_idx:
                raise ExecutionError(
                    "Exclusive event mapping corrupted: Yes option not in pool",
                    code="POOL_MAPPING_ERROR",
                    http_status=422,
                )
            if pool_state.option_id_to_idx[yes_opt_id] != mapped_idx:
                raise ExecutionError(
                    "Exclusive event mapping corrupted: index mismatch",
                    code="POOL_MAPPING_ERROR",
                    http_status=422,
                )
            # Use the Yes option_id for the quote, but keep original option for position tracking
            quote_option_id = yes_opt_id
        else:
            quote_option_id = option_id

        # 3) Lock balance first
        balance = _lock_balance(user.id, token, now)
        if balance.available_amount < amt:
            raise ExecutionError("Insufficient balance", code="INSUFFICIENT_BALANCE", http_status=400)

        # 4) Then lock position (position is tracked on the ORIGINAL option, not the mapped one)
        position, _ = _lock_position(user.id, market.id, option.id, now)

        # Quote (pure math)
        try:
            quote = quote_from_state(
                pool_state,
                option_id=quote_option_id,
                option_index=option_index if not is_no_side else None,
                side="buy",
                amount_in=amt,
                shares=None,
                money_quant=money_quant,
                is_no_side=is_no_side,
            )
        except Exception as exc:
            raise ExecutionError(f"Quote math error: {exc}", code="QUOTE_MATH_ERROR", http_status=422)

        shares_out = Decimal(str(quote.get("shares_out", "0")))
        if shares_out <= 0:
            raise ExecutionError("Amount too low to cover fees / price impact", code="AMOUNT_TOO_LOW", http_status=400)

        # For No-side, target_idx is the Yes option we're betting against
        if is_no_side:
            _, target_idx = pool_state.no_to_yes_option_id[target_option_id]
        else:
            target_key = str(option.id)
            if target_key not in pool_state.option_id_to_idx:
                raise ExecutionError("Option not present in pool state", code="POOL_MISMATCH", http_status=422)
            target_idx = pool_state.option_id_to_idx[target_key]

        if min_shares_dec is not None and shares_out < min_shares_dec:
            raise ExecutionError(
                "Slippage protection: shares_out below min_shares_out",
                code="SLIPPAGE_PROTECTION",
                http_status=400,
            )

        if max_slippage_bps_int is not None:
            pre_probs = quote.get("pre_prob_bps")
            if is_no_side:
                # For No side, the "price" is 1 - p[target_idx]
                expected_bps = None
                if isinstance(pre_probs, list) and 0 <= target_idx < len(pre_probs):
                    expected_bps = Decimal(10000 - pre_probs[target_idx])
            else:
                expected_bps = None
                if isinstance(pre_probs, list) and 0 <= target_idx < len(pre_probs):
                    expected_bps = Decimal(str(pre_probs[target_idx]))
                elif isinstance(pre_probs, int):
                    expected_bps = Decimal(pre_probs)

            avg_price_bps = quote.get("avg_price_bps")
            if expected_bps is None or avg_price_bps is None:
                raise ExecutionError(
                    "Slippage protection unavailable for this trade",
                    code="SLIPPAGE_PROTECTION",
                    http_status=422,
                )

            if expected_bps <= 0:
                raise ExecutionError(
                    "Slippage protection unavailable: reference price invalid",
                    code="SLIPPAGE_PROTECTION",
                    http_status=422,
                )

            avg_price_dec = Decimal(str(avg_price_bps))
            max_price = expected_bps * (Decimal(10000 + max_slippage_bps_int) / Decimal(10000))
            if avg_price_dec > max_price:
                raise ExecutionError(
                    "Slippage protection: average price above max_slippage_bps",
                    code="SLIPPAGE_PROTECTION",
                    http_status=400,
                )

        # Apply balance and position - FIX: use F() for atomic balance update
        BalanceSnapshot.objects.filter(pk=balance.pk).update(
            available_amount=F("available_amount") - amt,
            updated_at=now,
        )
        # Refresh balance for return value
        balance.refresh_from_db()

        position.shares = Decimal(position.shares) + shares_out
        position.cost_basis = Decimal(position.cost_basis) + amt
        position.updated_at = now
        position.save(update_fields=["shares", "cost_basis", "updated_at"])

        # Update AMM state q - FIX: use bulk_update to prevent race condition
        if is_no_side and quote.get("no_buy_deltas"):
            # For No-side buy, update all options based on deltas
            no_buy_deltas = quote["no_buy_deltas"]
            states_to_update = []
            for idx, delta in enumerate(no_buy_deltas):
                if delta > 0:
                    state_obj = option_states[idx]
                    state_obj.q = Decimal(state_obj.q) + Decimal(str(delta))
                    state_obj.updated_at = now
                    states_to_update.append(state_obj)
            if states_to_update:
                AmmPoolOptionState.objects.bulk_update(states_to_update, ["q", "updated_at"])
        else:
            # Standard buy: only target outcome changes
            target_state = option_states[target_idx]
            target_state.q = Decimal(target_state.q) + shares_out
            target_state.updated_at = now
            target_state.save(update_fields=["q", "updated_at"])

        # Update displayed probabilities (cache) from persisted q
        _recompute_option_probs(option_states, pool_state.b, now, is_exclusive=pool_state.is_exclusive)

        wallet = _ensure_wallet(user, wallet_id, now)

        order_intent = OrderIntent.objects.create(
            user=user,
            wallet=wallet,
            market=market,
            option=option,
            side="buy",
            amount_in=amt,
            shares_out=shares_out,
            chain=market.chain or DEFAULT_CHAIN,
            status="confirmed",
            client_nonce=client_nonce,
            created_at=now,
            updated_at=now,
        )

        Trade.objects.create(
            chain=market.chain or DEFAULT_CHAIN,
            tx_hash=f"offchain:{order_intent.id}",
            block_number=0,
            block_time=now,
            market=market,
            option=option,
            user=user,
            wallet=wallet,
            side="buy",
            amount_in=amt,
            shares=shares_out,
            price_bps=quote.get("avg_price_bps"),
            fee_amount=Decimal(str(quote.get("fee_amount", "0"))),
            created_at=now,
            log_index=0,
        )

        _update_stats_volume(option.id, amt, now)

        # Update pool_cash: money coming in from buy
        pool.pool_cash = Decimal(pool.pool_cash) + amt
        pool.updated_at = now
        pool.save(update_fields=["pool_cash", "updated_at"])

        # Invalidate caches after successful trade
        event_id = str(market.event_id) if market.event_id else None
        invalidate_on_trade(str(market.id), str(user.id), event_id)

        return {
            "market_id": str(market.id),
            "option_id": option.id,
            "option_index": option.option_index,
            "amount_in": str(amt),
            "shares_out": str(shares_out),
            "fee_amount": quote.get("fee_amount"),
            "avg_price_bps": quote.get("avg_price_bps"),
            "pre_prob_bps": quote.get("pre_prob_bps"),
            "post_prob_bps": quote.get("post_prob_bps"),
            "balance_available": str(balance.available_amount),
            "position": {"shares": str(position.shares), "cost_basis": str(position.cost_basis)},
            "order_intent_id": order_intent.id,
        }


def execute_sell(
    *,
    user,
    market_id,
    option_id: Optional[str],
    option_index: Optional[int],
    shares: Optional[Number] = None,
    desired_amount_out: Optional[Number] = None,
    sell_all: bool = False,
    token: str = DEFAULT_TOKEN,
    wallet_id: Optional[str] = None,
    client_nonce: Optional[str] = None,
    money_quant: Decimal = MONEY_QUANT,
    min_amount_out: Optional[Number] = None,
) -> Dict:
    """
    Execute a SELL against the AMM with full locking and persistence.

    Provide either:
      - shares: exact shares to sell
      - desired_amount_out: net amount you want to receive (engine will compute shares_in)
      - sell_all: True to sell all shares (handles dust cleanup)

    LOCK ORDER (must match execute_buy):
      1) Market + Option
      2) Pool option_state rows
      3) BalanceSnapshot
      4) Position
    """
    if not sell_all and shares is None and desired_amount_out is None:
        raise ExecutionError("shares, desired_amount_out, or sell_all is required", code="INVALID_PARAM", http_status=400)

    shares_in = _to_decimal(shares, "shares") if shares is not None else None
    desired_out = _to_decimal(desired_amount_out, "desired_amount_out") if desired_amount_out is not None else None
    min_amount_out_dec = _to_decimal(min_amount_out, "min_amount_out") if min_amount_out is not None else None

    with transaction.atomic():
        market, option, now = _lock_market_and_option(market_id, option_id, option_index)
        pool, option_states, pool_state = _lock_pool_state(market_id)

        # Detect if this is a No option in an exclusive event
        is_no_side = False
        target_option_id = str(option.id)
        if target_option_id in pool_state.no_to_yes_option_id:
            is_no_side = True
            yes_opt_id, target_idx = pool_state.no_to_yes_option_id[target_option_id]
            # FIX: Validate mapping consistency
            if yes_opt_id not in pool_state.option_id_to_idx:
                raise ExecutionError(
                    "Exclusive event mapping corrupted: Yes option not in pool",
                    code="POOL_MAPPING_ERROR",
                    http_status=422,
                )
            if pool_state.option_id_to_idx[yes_opt_id] != target_idx:
                raise ExecutionError(
                    "Exclusive event mapping corrupted: index mismatch",
                    code="POOL_MAPPING_ERROR",
                    http_status=422,
                )
            quote_option_id = yes_opt_id
        else:
            quote_option_id = option_id
            target_key = str(option.id)
            if target_key not in pool_state.option_id_to_idx:
                raise ExecutionError("Option not present in pool state", code="POOL_MISMATCH", http_status=422)
            target_idx = pool_state.option_id_to_idx[target_key]

        # ✅ FIX: lock Balance BEFORE Position to match execute_buy and avoid deadlocks
        balance = _lock_balance(user.id, token, now)

        position, _ = _lock_position(user.id, market.id, option.id, now)
        if Decimal(position.shares) <= 0:
            raise ExecutionError("No position to sell", code="NO_POSITION", http_status=400)

        position_shares = Decimal(position.shares)

        # Handle sell_all: use all shares from position
        if sell_all:
            shares_in = position_shares

        # Dust threshold: positions below this are cleaned up without AMM calculation
        DUST_THRESHOLD = Decimal("0.1")  # 0.1 shares

        # If selling all and position is dust, clean up without AMM
        if sell_all and position_shares <= DUST_THRESHOLD:
            # Dust cleanup: zero out position, no proceeds
            position.shares = Decimal("0")
            position.cost_basis = Decimal("0")
            position.updated_at = now
            position.save(update_fields=["shares", "cost_basis", "updated_at"])

            return {
                "market_id": str(market.id),
                "option_id": option.id,
                "option_index": option.option_index,
                "amount_out": "0",
                "shares_sold": str(position_shares),
                "fee_amount": "0",
                "avg_price_bps": 0,
                "pre_prob_bps": None,
                "post_prob_bps": None,
                "balance_available": str(balance.available_amount),
                "position": {"shares": "0", "cost_basis": "0"},
                "dust_cleanup": True,
            }

        try:
            quote = quote_from_state(
                pool_state,
                option_id=quote_option_id,
                option_index=option_index if not is_no_side else None,
                side="sell",
                amount_in=desired_out if desired_out is not None else None,
                shares=shares_in if shares_in is not None else None,
                money_quant=money_quant,
                is_no_side=is_no_side,
            )
        except Exception as exc:
            raise ExecutionError(f"Quote math error: {exc}", code="QUOTE_MATH_ERROR", http_status=422)

        shares_to_sell = Decimal(str(quote.get("shares_in", "0")))
        if shares_to_sell <= 0:
            raise ExecutionError("Invalid sell size", code="INVALID_PARAM", http_status=400)

        position_shares = Decimal(position.shares)
        # Allow selling all shares even with tiny precision differences
        if shares_to_sell > position_shares:
            # If difference is tiny (< 0.01), allow selling all
            if shares_to_sell - position_shares < Decimal("0.01"):
                shares_to_sell = position_shares
            else:
                raise ExecutionError("Insufficient shares", code="INSUFFICIENT_SHARES", http_status=400)

        amount_out = Decimal(str(quote.get("amount_out", "0")))
        if amount_out <= 0:
            raise ExecutionError("Sell amount too low after fees / price impact", code="AMOUNT_TOO_LOW", http_status=400)

        if min_amount_out_dec is not None and amount_out < min_amount_out_dec:
            raise ExecutionError(
                "Slippage protection: amount_out below min_amount_out",
                code="SLIPPAGE_PROTECTION",
                http_status=400,
            )

        # Update position (reduce cost_basis proportionally)
        cost_reduction = (
            Decimal(position.cost_basis) * shares_to_sell / Decimal(position.shares)
            if Decimal(position.shares) > 0
            else Decimal("0")
        )
        position.shares = Decimal(position.shares) - shares_to_sell
        position.cost_basis = max(Decimal("0"), Decimal(position.cost_basis) - cost_reduction)
        position.updated_at = now
        position.save(update_fields=["shares", "cost_basis", "updated_at"])

        # Update AMM state q - FIX: use bulk_update to prevent race condition
        if is_no_side and quote.get("no_sell_deltas"):
            # For No-side sell, update all options based on deltas
            no_sell_deltas = quote["no_sell_deltas"]
            states_to_update = []
            for idx, delta in enumerate(no_sell_deltas):
                if delta != 0:
                    state_obj = option_states[idx]
                    state_obj.q = Decimal(state_obj.q) + Decimal(str(delta))
                    state_obj.updated_at = now
                    states_to_update.append(state_obj)
            if states_to_update:
                AmmPoolOptionState.objects.bulk_update(states_to_update, ["q", "updated_at"])
        else:
            # Standard sell: only target outcome changes
            target_state = option_states[target_idx]
            target_state.q = Decimal(target_state.q) - shares_to_sell
            target_state.updated_at = now
            target_state.save(update_fields=["q", "updated_at"])

        # Update probabilities (cache)
        _recompute_option_probs(option_states, pool_state.b, now, is_exclusive=pool_state.is_exclusive)

        # Balance credit - FIX: use F() for atomic balance update
        BalanceSnapshot.objects.filter(pk=balance.pk).update(
            available_amount=F("available_amount") + amount_out,
            updated_at=now,
        )
        # Refresh balance for return value
        balance.refresh_from_db()

        wallet = _ensure_wallet(user, wallet_id, now)

        order_intent = OrderIntent.objects.create(
            user=user,
            wallet=wallet,
            market=market,
            option=option,
            side="sell",
            amount_in=amount_out,          # schema field name; represents proceeds here
            shares_out=shares_to_sell,     # schema field name; represents shares sold here
            chain=market.chain or DEFAULT_CHAIN,
            status="confirmed",
            client_nonce=client_nonce,
            created_at=now,
            updated_at=now,
        )

        Trade.objects.create(
            chain=market.chain or DEFAULT_CHAIN,
            tx_hash=f"offchain:{order_intent.id}",
            block_number=0,
            block_time=now,
            market=market,
            option=option,
            user=user,
            wallet=wallet,
            side="sell",
            amount_in=amount_out,
            shares=shares_to_sell,
            price_bps=quote.get("avg_price_bps"),
            fee_amount=Decimal(str(quote.get("fee_amount", "0"))),
            created_at=now,
            log_index=0,
        )

        _update_stats_volume(option.id, amount_out, now)

        # Update pool_cash: money going out for sell
        pool.pool_cash = Decimal(pool.pool_cash) - amount_out
        pool.updated_at = now
        pool.save(update_fields=["pool_cash", "updated_at"])

        # Invalidate caches after successful trade
        event_id = str(market.event_id) if market.event_id else None
        invalidate_on_trade(str(market.id), str(user.id), event_id)

        return {
            "market_id": str(market.id),
            "option_id": option.id,
            "option_index": option.option_index,
            "amount_out": str(amount_out),
            "shares_sold": str(shares_to_sell),
            "fee_amount": quote.get("fee_amount"),
            "avg_price_bps": quote.get("avg_price_bps"),
            "pre_prob_bps": quote.get("pre_prob_bps"),
            "post_prob_bps": quote.get("post_prob_bps"),
            "balance_available": str(balance.available_amount),
            "position": {"shares": str(position.shares), "cost_basis": str(position.cost_basis)},
            "order_intent_id": order_intent.id,
        }
