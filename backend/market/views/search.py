from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from market.models import Event, Market, MarketOption, MarketOptionStats
from market.services import search as search_service


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
        return JsonResponse({
            "results": result.get("hits", []),
            "total": result.get("estimatedTotalHits", 0),
            "query": query,
        })
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def reindex_events(request):
    """Reindex all events to Meilisearch. Admin only."""
    try:
        events = Event.objects.filter(is_hidden=False).select_related("primary_market")
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
