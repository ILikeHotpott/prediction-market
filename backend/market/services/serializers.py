from decimal import Decimal
from ..models import Event, Market, MarketOption, EventTranslation


def serialize_option(option: MarketOption):
    probability_bps = None
    volume_total = Decimal("0")
    if hasattr(option, "stats") and option.stats:
        probability_bps = option.stats.prob_bps
        volume_total = option.stats.volume_total or Decimal("0")

    return {
        "id": option.id,
        "title": option.title,
        "option_index": option.option_index,
        "side": option.side,
        "probability_bps": probability_bps,
        "probability": round(probability_bps / 100, 2) if probability_bps is not None else None,
        "volume_total": float(volume_total),
    }


def serialize_market(market: Market):
    options = []
    if hasattr(market, "prefetched_options"):
        options = market.prefetched_options
    elif hasattr(market, "options"):
        options = list(market.options.all())

    option_payload = [serialize_option(o) for o in options]
    is_binary = len(option_payload) == 2

    # Aggregate volume_total from all options
    total_volume = sum(o.get("volume_total", 0) for o in option_payload)

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
        "trading_deadline": market.trading_deadline.isoformat() if market.trading_deadline else None,
        "resolution_deadline": market.resolution_deadline.isoformat()
        if market.resolution_deadline
        else None,
        "slug": market.slug,
        "created_at": market.created_at.isoformat() if market.created_at else None,
        "updated_at": market.updated_at.isoformat() if market.updated_at else None,
        "options": option_payload,
        "volume_total": total_volume,
    }


def serialize_event(event: Event, lang: str = "en"):
    markets = []
    if hasattr(event, "prefetched_markets"):
        markets = event.prefetched_markets
    elif hasattr(event, "markets"):
        markets = list(event.markets.all())

    market_payload = [serialize_market(m) for m in markets]
    primary_market = None
    if event.primary_market_id:
        primary_market = next((m for m in market_payload if m["id"] == str(event.primary_market_id)), None)
    if primary_market is None and market_payload:
        primary_market = market_payload[0]

    title = event.title
    description = event.description

    # Get translation if not English
    if lang != "en":
        # Check prefetched translations first
        if hasattr(event, "prefetched_translations"):
            trans = next((t for t in event.prefetched_translations if t.language == lang), None)
            if trans:
                title = trans.title
                if trans.description:
                    description = trans.description
        else:
            # Query directly
            try:
                trans = EventTranslation.objects.get(event_id=event.id, language=lang)
                title = trans.title
                if trans.description:
                    description = trans.description
            except EventTranslation.DoesNotExist:
                pass

    return {
        "id": str(event.id),
        "title": title,
        "description": description,
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
        "trading_deadline": event.trading_deadline.isoformat() if event.trading_deadline else None,
        "resolution_deadline": event.resolution_deadline.isoformat() if event.resolution_deadline else None,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "updated_at": event.updated_at.isoformat() if event.updated_at else None,
        "markets": market_payload,
        "primary_market": primary_market,
    }
