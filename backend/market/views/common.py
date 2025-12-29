import math
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from ..models import Event, Market, MarketOption, User

def _parse_datetime(value: str):
    if not value:
        return None
    dt = parse_datetime(value)
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def _serialize_option(option: MarketOption):
    probability_bps = None
    if hasattr(option, "stats") and option.stats:
        probability_bps = option.stats.prob_bps

    return {
        "id": option.id,
        "title": option.title,
        "option_index": option.option_index,
        "side": option.side,
        "probability_bps": probability_bps,
        "probability": round(probability_bps / 100, 2) if probability_bps is not None else None,
    }


def _serialize_market(market: Market):
    options = []
    if hasattr(market, "prefetched_options"):
        options = market.prefetched_options
    elif hasattr(market, "options"):
        options = list(market.options.all())

    option_payload = [_serialize_option(o) for o in options]
    is_binary = len(option_payload) == 2

    return {
        "id": str(market.id),
        "event_id": str(market.event_id) if market.event_id else None,
        "title": market.title,
        "description": market.description,
        "status": market.status,
        "category": market.category,
        "cover_url": market.cover_url,
        "is_hidden": market.is_hidden,
        "is_binary": is_binary,
        "market_kind": market.market_kind if hasattr(market, "market_kind") else None,
        "assertion_text": market.assertion_text if hasattr(market, "assertion_text") else None,
        "bucket_label": market.bucket_label if hasattr(market, "bucket_label") else None,
        "trading_deadline": market.trading_deadline.isoformat()
        if market.trading_deadline
        else None,
        "resolution_deadline": market.resolution_deadline.isoformat()
        if market.resolution_deadline
        else None,
        "slug": market.slug,
        "created_at": market.created_at.isoformat() if market.created_at else None,
        "updated_at": market.updated_at.isoformat() if market.updated_at else None,
        "options": option_payload,
    }


def _serialize_event(event: Event):
    markets = []
    if hasattr(event, "prefetched_markets"):
        markets = event.prefetched_markets
    elif hasattr(event, "markets"):
        markets = list(event.markets.all())

    market_payload = [_serialize_market(m) for m in markets]
    primary_market = None
    if event.primary_market_id:
        primary_market = next((m for m in market_payload if m["id"] == str(event.primary_market_id)), None)
    if primary_market is None and market_payload:
        primary_market = market_payload[0]

    return {
        "id": str(event.id),
        "title": event.title,
        "description": event.description,
        "cover_url": event.cover_url,
        "category": event.category,
        "status": event.status,
        "is_hidden": event.is_hidden,
        "sort_weight": event.sort_weight,
        "slug": event.slug,
        "group_rule": event.group_rule,
        "primary_market_id": str(event.primary_market_id) if event.primary_market_id else None,
        "resolved_market_id": str(event.resolved_market_id) if event.resolved_market_id else None,
        "resolved_at": event.resolved_at.isoformat() if event.resolved_at else None,
        "resolve_type": event.resolve_type,
        "trading_deadline": event.trading_deadline.isoformat()
        if event.trading_deadline
        else None,
        "resolution_deadline": event.resolution_deadline.isoformat()
        if event.resolution_deadline
        else None,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "updated_at": event.updated_at.isoformat() if event.updated_at else None,
        "markets": market_payload,
        "primary_market": primary_market,
    }


def _get_user_from_request(request):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None
    try:
        return User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return None


def _require_admin(request):
    user = _get_user_from_request(request)
    if not user:
        return {"error": "Unauthorized", "status": 401}
    if user.role != "admin":
        return {"error": "Forbidden", "status": 403}
    return None

