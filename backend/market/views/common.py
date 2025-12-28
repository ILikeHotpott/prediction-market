import math
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from ..models import Market, MarketOption, User

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
        "title": market.title,
        "description": market.description,
        "status": market.status,
        "category": market.category,
        "cover_url": market.cover_url,
        "is_hidden": market.is_hidden,
        "is_binary": is_binary,
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

