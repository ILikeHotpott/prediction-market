"""
Cache utilities for the prediction market platform.

Provides centralized cache key management and invalidation helpers.
"""
import hashlib
import logging
from functools import wraps
from typing import Any, Callable, List, Optional

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Cache key prefixes
PREFIX_POOL_STATE = "pool_state"
PREFIX_QUOTE = "quote"
PREFIX_EVENT_LIST = "event_list"
PREFIX_EVENT_DETAIL = "event_detail"
PREFIX_MARKET_LIST = "market_list"
PREFIX_MARKET_DETAIL = "market_detail"
PREFIX_PORTFOLIO = "portfolio"
PREFIX_ORDER_HISTORY = "order_history"
PREFIX_LEADERBOARD = "leaderboard"


def _get_ttl(name: str, default: int = 60) -> int:
    """Get TTL from settings with fallback."""
    setting_name = f"CACHE_TTL_{name.upper()}"
    return getattr(settings, setting_name, default)


def make_key(*parts) -> str:
    """Create a cache key from parts."""
    return ":".join(str(p) for p in parts)


def make_hash_key(*parts) -> str:
    """Create a hashed cache key for long/complex keys."""
    raw = ":".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


# Pool State Cache
def get_pool_state_cache_key(market_id: str) -> str:
    return make_key(PREFIX_POOL_STATE, market_id)


def get_cached_pool_state(market_id: str) -> Optional[dict]:
    """Get cached pool state for a market."""
    key = get_pool_state_cache_key(market_id)
    return cache.get(key)


def set_cached_pool_state(market_id: str, state_dict: dict) -> None:
    """Cache pool state for a market."""
    key = get_pool_state_cache_key(market_id)
    ttl = _get_ttl("pool_state", 30)
    cache.set(key, state_dict, ttl)


def invalidate_pool_state(market_id: str) -> None:
    """Invalidate pool state cache for a market."""
    key = get_pool_state_cache_key(market_id)
    cache.delete(key)


# Quote Cache
def get_quote_cache_key(market_id: str, option_id: str, side: str, amount: str, shares: str) -> str:
    return make_key(PREFIX_QUOTE, market_id, option_id or "", side, amount or "", shares or "")


def get_cached_quote(market_id: str, option_id: str, side: str, amount: str, shares: str) -> Optional[dict]:
    """Get cached quote."""
    key = get_quote_cache_key(market_id, option_id, side, amount, shares)
    return cache.get(key)


def set_cached_quote(market_id: str, option_id: str, side: str, amount: str, shares: str, data: dict) -> None:
    """Cache quote result."""
    key = get_quote_cache_key(market_id, option_id, side, amount, shares)
    ttl = _get_ttl("quote", 10)
    cache.set(key, data, ttl)


# Event List Cache
def get_event_list_cache_key(
    category: Optional[str],
    is_admin: bool,
    ids: Optional[str] = None,
    lang: str = "en",
    include_translations: bool = False,
) -> str:
    return make_key(
        PREFIX_EVENT_LIST,
        category or "all",
        "admin" if is_admin else "public",
        lang or "en",
        "translations" if include_translations else "no_translations",
        ids or "",
    )


def get_cached_event_list(
    category: Optional[str],
    is_admin: bool,
    ids: Optional[str] = None,
    lang: str = "en",
    include_translations: bool = False,
) -> Optional[dict]:
    """Get cached event list."""
    key = get_event_list_cache_key(category, is_admin, ids, lang, include_translations)
    return cache.get(key)


def set_cached_event_list(
    category: Optional[str],
    is_admin: bool,
    data: dict,
    ids: Optional[str] = None,
    lang: str = "en",
    include_translations: bool = False,
) -> None:
    """Cache event list."""
    key = get_event_list_cache_key(category, is_admin, ids, lang, include_translations)
    ttl = _get_ttl("event_list", 60)
    cache.set(key, data, ttl)


def invalidate_event_list() -> None:
    """Invalidate all event list caches."""
    # Use pattern delete if available (Redis), otherwise delete known keys
    try:
        cache.delete_pattern(f"*{PREFIX_EVENT_LIST}*")
    except AttributeError:
        # LocMemCache doesn't support delete_pattern
        pass


# Event Detail Cache
def get_event_detail_cache_key(event_id: str, lang: str = "en", include_translations: bool = False) -> str:
    return make_key(
        PREFIX_EVENT_DETAIL,
        event_id,
        lang or "en",
        "translations" if include_translations else "no_translations",
    )


def get_cached_event_detail(
    event_id: str,
    lang: str = "en",
    include_translations: bool = False,
) -> Optional[dict]:
    """Get cached event detail."""
    key = get_event_detail_cache_key(event_id, lang, include_translations)
    return cache.get(key)


def set_cached_event_detail(
    event_id: str,
    data: dict,
    lang: str = "en",
    include_translations: bool = False,
) -> None:
    """Cache event detail."""
    key = get_event_detail_cache_key(event_id, lang, include_translations)
    ttl = _get_ttl("market_detail", 30)
    cache.set(key, data, ttl)


def invalidate_event_detail(event_id: str) -> None:
    """Invalidate event detail cache."""
    try:
        cache.delete_pattern(f"*{PREFIX_EVENT_DETAIL}:{event_id}*")
    except AttributeError:
        cache.delete(get_event_detail_cache_key(event_id))


# Market List Cache
def get_market_list_cache_key(is_admin: bool) -> str:
    return make_key(PREFIX_MARKET_LIST, "admin" if is_admin else "public")


def get_cached_market_list(is_admin: bool) -> Optional[dict]:
    """Get cached market list."""
    key = get_market_list_cache_key(is_admin)
    return cache.get(key)


def set_cached_market_list(is_admin: bool, data: dict) -> None:
    """Cache market list."""
    key = get_market_list_cache_key(is_admin)
    ttl = _get_ttl("event_list", 60)
    cache.set(key, data, ttl)


def invalidate_market_list() -> None:
    """Invalidate all market list caches."""
    cache.delete(get_market_list_cache_key(True))
    cache.delete(get_market_list_cache_key(False))


# Market Detail Cache
def get_market_detail_cache_key(market_id: str) -> str:
    return make_key(PREFIX_MARKET_DETAIL, market_id)


def get_cached_market_detail(market_id: str) -> Optional[dict]:
    """Get cached market detail."""
    key = get_market_detail_cache_key(market_id)
    return cache.get(key)


def set_cached_market_detail(market_id: str, data: dict) -> None:
    """Cache market detail."""
    key = get_market_detail_cache_key(market_id)
    ttl = _get_ttl("market_detail", 30)
    cache.set(key, data, ttl)


def invalidate_market_detail(market_id: str) -> None:
    """Invalidate market detail cache."""
    key = get_market_detail_cache_key(market_id)
    cache.delete(key)


# Portfolio Cache
def get_portfolio_cache_key(user_id: str, token: str, include_pnl: bool) -> str:
    return make_key(PREFIX_PORTFOLIO, user_id, token, "pnl" if include_pnl else "no_pnl")


def get_cached_portfolio(user_id: str, token: str, include_pnl: bool) -> Optional[dict]:
    """Get cached portfolio."""
    key = get_portfolio_cache_key(user_id, token, include_pnl)
    return cache.get(key)


def set_cached_portfolio(user_id: str, token: str, include_pnl: bool, data: dict) -> None:
    """Cache portfolio."""
    key = get_portfolio_cache_key(user_id, token, include_pnl)
    ttl = _get_ttl("portfolio", 30)
    cache.set(key, data, ttl)


def invalidate_user_portfolio(user_id: str) -> None:
    """Invalidate all portfolio caches for a user."""
    for token in ["USDC", "ETH"]:
        for include_pnl in [True, False]:
            key = get_portfolio_cache_key(user_id, token, include_pnl)
            cache.delete(key)


# Order History Cache
def get_order_history_cache_key(user_id: str, page: int, page_size: int) -> str:
    return make_key(PREFIX_ORDER_HISTORY, user_id, page, page_size)


def get_cached_order_history(user_id: str, page: int, page_size: int) -> Optional[dict]:
    """Get cached order history."""
    key = get_order_history_cache_key(user_id, page, page_size)
    return cache.get(key)


def set_cached_order_history(user_id: str, page: int, page_size: int, data: dict) -> None:
    """Cache order history."""
    key = get_order_history_cache_key(user_id, page, page_size)
    ttl = _get_ttl("order_history", 60)
    cache.set(key, data, ttl)


def invalidate_user_order_history(user_id: str) -> None:
    """Invalidate all order history caches for a user."""
    try:
        cache.delete_pattern(f"*{PREFIX_ORDER_HISTORY}:{user_id}:*")
    except AttributeError:
        pass


# Leaderboard Cache
def get_leaderboard_cache_key(period: str, category: Optional[str], sort_by: str, limit: int) -> str:
    return make_key(PREFIX_LEADERBOARD, period, category or "all", sort_by, limit)


def get_cached_leaderboard(period: str, category: Optional[str], sort_by: str, limit: int) -> Optional[dict]:
    """Get cached leaderboard."""
    key = get_leaderboard_cache_key(period, category, sort_by, limit)
    return cache.get(key)


def set_cached_leaderboard(period: str, category: Optional[str], sort_by: str, limit: int, data: dict) -> None:
    """Cache leaderboard."""
    key = get_leaderboard_cache_key(period, category, sort_by, limit)
    ttl = _get_ttl("leaderboard", 120)
    cache.set(key, data, ttl)


def invalidate_leaderboard() -> None:
    """Invalidate all leaderboard caches."""
    try:
        cache.delete_pattern(f"*{PREFIX_LEADERBOARD}*")
    except AttributeError:
        pass


# Batch invalidation helpers
def invalidate_on_trade(market_id: str, user_id: str, event_id: Optional[str] = None) -> None:
    """Invalidate all caches affected by a trade."""
    invalidate_pool_state(market_id)
    invalidate_market_detail(market_id)
    invalidate_user_portfolio(user_id)
    invalidate_user_order_history(user_id)
    invalidate_leaderboard()
    invalidate_market_list()
    if event_id:
        invalidate_event_detail(event_id)
        invalidate_event_list()


def invalidate_on_market_change(market_id: str, event_id: Optional[str] = None) -> None:
    """Invalidate caches when market status/data changes."""
    invalidate_market_detail(market_id)
    invalidate_market_list()
    invalidate_pool_state(market_id)
    if event_id:
        invalidate_event_detail(event_id)
        invalidate_event_list()


def invalidate_on_event_change(event_id: str) -> None:
    """Invalidate caches when event status/data changes."""
    invalidate_event_detail(event_id)
    invalidate_event_list()
