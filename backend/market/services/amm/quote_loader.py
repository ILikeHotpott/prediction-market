import math
from typing import Dict, List, Tuple

from ...models import AmmPool, AmmPoolOptionState, Market, MarketOption
from .errors import QuoteMathError, QuoteNotFoundError
from .money import _fee_rate_from_bps
from .state import PoolState


def load_pool_state(market_id) -> PoolState:
    """
    Read-only ORM fetch and normalize into PoolState.
    Supports both market-level pools and event-level pools (for exclusive events).
    """
    # Try market-level pool first
    pool = AmmPool.objects.filter(market_id=market_id).first()
    
    is_exclusive = False
    event = None
    
    # If no market-level pool, check for event-level pool (exclusive events)
    if pool is None:
        try:
            market = Market.objects.select_related("event").get(pk=market_id)
            if market.event_id:
                pool = AmmPool.objects.filter(event_id=market.event_id).first()
                if pool is not None:
                    event = market.event
                    is_exclusive = (event.group_rule or "").strip().lower() == "exclusive"
        except Market.DoesNotExist:
            pass
    
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
    
    # Build no_to_yes_option_id mapping for exclusive events
    no_to_yes_option_id: Dict[str, Tuple[str, int]] = {}
    if is_exclusive:
        # For each Yes option in the pool, find its No counterpart
        yes_option_ids = [int(oid) for oid in option_ids]
        yes_options = MarketOption.objects.filter(id__in=yes_option_ids).values_list("id", "market_id")
        yes_market_ids = [m_id for _, m_id in yes_options]
        yes_opt_by_market = {m_id: opt_id for opt_id, m_id in yes_options}
        
        # Find No counterparts (side='no' in the same markets)
        no_options = list(
            MarketOption.objects.filter(market_id__in=yes_market_ids, side="no", is_active=True)
            .values_list("id", "market_id")
        )
        for no_opt_id, m_id in no_options:
            yes_opt_id = yes_opt_by_market.get(m_id)
            if yes_opt_id is not None:
                yes_opt_str = str(yes_opt_id)
                if yes_opt_str in option_id_to_idx:
                    pool_idx = option_id_to_idx[yes_opt_str]
                    no_to_yes_option_id[str(no_opt_id)] = (yes_opt_str, pool_idx)

    return PoolState(
        market_id=str(market_id),  # Use the passed market_id, consistent with execution
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


