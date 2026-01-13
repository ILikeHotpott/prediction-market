import math
from typing import List, Optional

from ...models import AmmPoolOptionState, MarketOption
from .errors import QuoteMathError, QuoteNotFoundError
from .money import _fee_rate_from_bps
from .pool_utils import build_no_to_yes_mapping, load_pool_for_market
from .state import PoolState
from ..cache import get_cached_pool_state, set_cached_pool_state


def _pool_state_to_dict(state: PoolState) -> dict:
    """Convert PoolState to a cacheable dict."""
    return {
        "market_id": state.market_id,
        "pool_id": state.pool_id,
        "b": state.b,
        "fee_bps": state.fee_bps,
        "option_ids": state.option_ids,
        "option_indexes": state.option_indexes,
        "q": state.q,
        "option_id_to_idx": state.option_id_to_idx,
        "option_index_to_idx": state.option_index_to_idx,
        "no_to_yes_option_id": state.no_to_yes_option_id,
        "is_exclusive": state.is_exclusive,
    }


def _dict_to_pool_state(d: dict) -> PoolState:
    """Convert cached dict back to PoolState."""
    return PoolState(
        market_id=d["market_id"],
        pool_id=d["pool_id"],
        b=d["b"],
        fee_bps=d["fee_bps"],
        option_ids=d["option_ids"],
        option_indexes=d["option_indexes"],
        q=d["q"],
        option_id_to_idx=d["option_id_to_idx"],
        option_index_to_idx={int(k): v for k, v in d["option_index_to_idx"].items()},
        no_to_yes_option_id=d["no_to_yes_option_id"],
        is_exclusive=d["is_exclusive"],
    )


def load_pool_state(market_id, use_cache: bool = True) -> PoolState:
    """
    Read-only ORM fetch and normalize into PoolState.
    Supports both market-level pools and event-level pools (for exclusive events).
    Uses cache when use_cache=True (default).
    """
    market_id_str = str(market_id)

    # Try cache first
    if use_cache:
        cached = get_cached_pool_state(market_id_str)
        if cached is not None:
            return _dict_to_pool_state(cached)

    pool, is_exclusive, _ = load_pool_for_market(market_id, for_update=False)

    if pool is None:
        raise QuoteNotFoundError("AMM pool not found for market")

    states = list(
        AmmPoolOptionState.objects.select_related("option")
        .filter(pool=pool)
        .order_by("option__option_index", "option_id")
    )
    if not states:
        raise QuoteNotFoundError("AMM pool option state not found")

    b = float(pool.b)
    if not (math.isfinite(b) and b > 0.0):
        raise QuoteMathError("pool.b must be positive finite")

    fee_bps = int(pool.fee_bps or 0)
    _ = _fee_rate_from_bps(fee_bps)  # validates range

    option_ids: List[str] = []
    option_indexes: List[int] = []
    q: List[float] = []
    for s in states:
        opt: MarketOption = s.option
        option_ids.append(str(opt.id))
        option_indexes.append(int(opt.option_index))
        q.append(float(s.q))

    option_id_to_idx = {oid: i for i, oid in enumerate(option_ids)}
    option_index_to_idx = {oi: i for i, oi in enumerate(option_indexes)}

    # Build no_to_yes_option_id mapping for exclusive events (optimized single query)
    no_to_yes_option_id = build_no_to_yes_mapping(option_ids, option_id_to_idx) if is_exclusive else {}

    state = PoolState(
        market_id=market_id_str,
        pool_id=str(pool.id),
        b=b,
        fee_bps=fee_bps,
        option_ids=option_ids,
        option_indexes=option_indexes,
        q=q,
        option_id_to_idx=option_id_to_idx,
        option_index_to_idx=option_index_to_idx,
        no_to_yes_option_id=no_to_yes_option_id,
        is_exclusive=is_exclusive,
    )

    # Cache the result
    if use_cache:
        set_cached_pool_state(market_id_str, _pool_state_to_dict(state))

    return state


