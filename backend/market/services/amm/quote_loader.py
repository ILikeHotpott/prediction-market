import math
from typing import List

from ...models import AmmPoolOptionState, MarketOption
from .errors import QuoteMathError, QuoteNotFoundError
from .money import _fee_rate_from_bps
from .pool_utils import build_no_to_yes_mapping, load_pool_for_market
from .state import PoolState


def load_pool_state(market_id) -> PoolState:
    """
    Read-only ORM fetch and normalize into PoolState.
    Supports both market-level pools and event-level pools (for exclusive events).
    """
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

    return PoolState(
        market_id=str(market_id),
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


