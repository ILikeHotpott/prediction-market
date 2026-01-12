"""
Shared utilities for pool state loading.
Extracts common logic between execution.py and quote_loader.py.
"""
from typing import Dict, List, Tuple

from ...models import AmmPool, AmmPoolOptionState, Market, MarketOption


def build_no_to_yes_mapping(
    option_ids: List[str],
    option_id_to_idx: Dict[str, int],
) -> Dict[str, Tuple[str, int]]:
    """
    Build no_to_yes_option_id mapping for exclusive events.
    Maps No option_id -> (Yes option_id, pool_idx).

    Optimized to use a single query with Q objects.
    """
    if not option_ids:
        return {}

    yes_option_ids = [int(oid) for oid in option_ids]

    # Single query to get both Yes and No options with their market IDs
    all_options = list(
        MarketOption.objects.filter(
            market_id__in=MarketOption.objects.filter(id__in=yes_option_ids).values("market_id")
        ).values_list("id", "market_id", "side")
    )

    # Build mappings
    yes_opt_by_market: Dict[str, int] = {}
    no_opts_by_market: Dict[str, List[int]] = {}

    for opt_id, market_id, side in all_options:
        if opt_id in yes_option_ids:
            yes_opt_by_market[market_id] = opt_id
        elif side == "no":
            if market_id not in no_opts_by_market:
                no_opts_by_market[market_id] = []
            no_opts_by_market[market_id].append(opt_id)

    # Build the mapping
    no_to_yes_option_id: Dict[str, Tuple[str, int]] = {}
    for market_id, no_opt_ids in no_opts_by_market.items():
        yes_opt_id = yes_opt_by_market.get(market_id)
        if yes_opt_id is not None:
            yes_opt_str = str(yes_opt_id)
            if yes_opt_str in option_id_to_idx:
                pool_idx = option_id_to_idx[yes_opt_str]
                for no_opt_id in no_opt_ids:
                    no_to_yes_option_id[str(no_opt_id)] = (yes_opt_str, pool_idx)

    return no_to_yes_option_id


def load_pool_for_market(market_id: str, for_update: bool = False):
    """
    Load AMM pool for a market, checking both market-level and event-level pools.

    Args:
        market_id: The market ID to load pool for
        for_update: If True, use select_for_update() for locking

    Returns:
        Tuple of (pool, is_exclusive, event) or (None, False, None) if not found
    """
    queryset = AmmPool.objects
    if for_update:
        queryset = queryset.select_for_update()

    # Try market-level pool first
    pool = queryset.filter(market_id=market_id).first()

    is_exclusive = False
    event = None

    # If no market-level pool, check for event-level pool (exclusive events)
    if pool is None:
        try:
            market = Market.objects.select_related("event").get(pk=market_id)
            if market.event_id:
                pool = queryset.filter(event_id=market.event_id).first()
                if pool is not None:
                    event = market.event
                    is_exclusive = (event.group_rule or "").strip().lower() == "exclusive"
        except Market.DoesNotExist:
            pass

    return pool, is_exclusive, event
