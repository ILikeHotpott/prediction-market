from django.http import JsonResponse
from django.db.models import Q
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from market.models import Event, Market, MarketOption, MarketOptionStats, FinanceMarketWindow
from market.services import search as search_service


def _build_search_doc(event: Event, market: Market):
    volume = 0
    outcomes = []
    if market:
        stats = list(MarketOptionStats.objects.filter(market_id=market.id))
        volume = sum(float(s.volume_total or 0) for s in stats)
        options = list(MarketOption.objects.filter(market_id=market.id))
        for opt in options:
            stat = next((s for s in stats if s.option_id == opt.id), None)
            outcomes.append({
                "id": opt.id,
                "name": opt.title,
                "probability_bps": stat.prob_bps if stat else 0,
            })
    return {
        "id": str(event.id),
        "title": event.title,
        "description": event.description or "",
        "category": event.category or "",
        "status": event.status,
        "cover_url": event.cover_url,
        "created_at": event.created_at.timestamp() if event.created_at else 0,
        "trading_deadline": event.trading_deadline.timestamp() if event.trading_deadline else 0,
        "volume_total": volume,
        "market_id": str(market.id) if market else None,
        "outcomes": outcomes,
    }


@require_http_methods(["GET"])
def search(request):
    """Search events using Meilisearch."""
    query = request.GET.get("q", "")
    status_filter = request.GET.get("status", "")
    category = request.GET.get("category", "")
    sort_by = request.GET.get("sort", "")
    limit = min(int(request.GET.get("limit", 20)), 100)
    offset = int(request.GET.get("offset", 0))

    filters = []
    # Default to active status only (same as homepage)
    if status_filter and status_filter != "all":
        filters.append(f'status = "{status_filter}"')
    else:
        filters.append('status = "active"')
    if category:
        filters.append(f'category = "{category}"')

    sort = []
    if sort_by == "newest":
        sort = ["created_at:desc"]
    elif sort_by == "ending":
        sort = ["trading_deadline:asc"]
    elif sort_by == "volume":
        sort = ["volume_total:desc"]

    try:
        result = search_service.search_events(
            query=query,
            filters=" AND ".join(filters) if filters else None,
            sort=sort if sort else None,
            limit=limit,
            offset=offset,
        )
        hits = result.get("hits", [])
        now = timezone.now()
        now_ts = now.timestamp()
        filtered_hits = []
        expired_ids = []
        for hit in hits:
            category = (hit.get("category") or "").strip().lower()
            deadline = hit.get("trading_deadline")
            if category == "finance" and deadline is not None:
                try:
                    if float(deadline) <= now_ts:
                        expired_ids.append(hit.get("id"))
                        continue
                except (TypeError, ValueError):
                    pass
            filtered_hits.append(hit)
        seen_ids = {str(hit.get("id")) for hit in filtered_hits if hit.get("id")}
        if expired_ids:
            expired_windows = (
                FinanceMarketWindow.objects.filter(event_id__in=[eid for eid in expired_ids if eid])
                .values("asset_symbol", "interval")
                .distinct()
            )
            for window in expired_windows:
                latest = (
                    FinanceMarketWindow.objects.select_related("event", "market")
                    .filter(
                        asset_symbol=window["asset_symbol"],
                        interval=window["interval"],
                        window_end__gt=now,
                        close_price__isnull=True,
                        event__is_hidden=False,
                        event__status="active",
                        market__status="active",
                    )
                    .order_by("-window_start")
                    .first()
                )
                if not latest or not latest.event or not latest.market:
                    continue
                doc = _build_search_doc(latest.event, latest.market)
                if doc["id"] in seen_ids:
                    continue
                filtered_hits.append(doc)
                seen_ids.add(doc["id"])
                try:
                    search_service.index_event(doc)
                except Exception:
                    pass
        if not filtered_hits and query and (not category or category.strip().lower() == "finance"):
            fallback_events = (
                Event.objects.filter(
                    is_hidden=False,
                    status="active",
                    category__iexact="finance",
                )
                .filter(Q(title__icontains=query) | Q(description__icontains=query))
                .select_related("primary_market")[:limit]
            )
            for event in fallback_events:
                market = event.primary_market
                doc = _build_search_doc(event, market)
                if doc["id"] in seen_ids:
                    continue
                filtered_hits.append(doc)
                seen_ids.add(doc["id"])
                try:
                    search_service.index_event(doc)
                except Exception:
                    pass
        for event_id in expired_ids:
            if event_id:
                try:
                    search_service.delete_event(str(event_id))
                except Exception:
                    pass
        return JsonResponse({
            "results": filtered_hits,
            "total": max(len(filtered_hits), (result.get("estimatedTotalHits", 0) - len(expired_ids))),
            "query": query,
        })
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def reindex_events(request):
    """Reindex all events to Meilisearch. Admin only."""
    try:
        now = timezone.now()
        finance_active_ids = list(
            FinanceMarketWindow.objects.filter(
                window_end__gt=now,
                close_price__isnull=True,
            ).values_list("event_id", flat=True)
        )
        events = (
            Event.objects.filter(is_hidden=False, status="active")
            .filter(
                Q(category__iexact="finance", id__in=finance_active_ids)
                | ~Q(category__iexact="finance")
            )
            .select_related("primary_market")
        )
        docs = []
        for event in events:
            market = event.primary_market
            volume = 0
            outcomes = []
            if market:
                stats = MarketOptionStats.objects.filter(market_id=market.id)
                volume = sum(float(s.volume_total or 0) for s in stats)
                options = MarketOption.objects.filter(market_id=market.id)
                for opt in options:
                    stat = next((s for s in stats if s.option_id == opt.id), None)
                    outcomes.append({
                        "id": opt.id,
                        "name": opt.title,
                        "probability_bps": stat.prob_bps if stat else 0,
                    })

            docs.append({
                "id": str(event.id),
                "title": event.title,
                "description": event.description or "",
                "category": event.category or "",
                "status": event.status,
                "cover_url": event.cover_url,
                "created_at": event.created_at.timestamp() if event.created_at else 0,
                "trading_deadline": event.trading_deadline.timestamp() if event.trading_deadline else 0,
                "volume_total": volume,
                "market_id": str(market.id) if market else None,
                "outcomes": outcomes,
            })

        search_service.index_events(docs)
        return JsonResponse({"indexed": len(docs)})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
