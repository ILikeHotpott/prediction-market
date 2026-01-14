from datetime import timedelta

from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from ..models import MarketOptionSeries, MarketOption, MarketOptionStats


# Time range for each interval
INTERVAL_HOURS = {
    "1M": 1/60,      # 1 minute
    "1H": 1,         # 1 hour
    "4H": 4,         # 4 hours
    "1D": 24,        # 1 day
    "1W": 168,       # 1 week
    "ALL": 720,      # 30 days
}

# Max points per option for each interval (to limit response size)
MAX_POINTS = {
    "1M": 50,
    "1H": 100,
    "4H": 100,
    "1D": 200,
    "1W": 300,
    "ALL": 500,
}


@require_http_methods(["GET", "OPTIONS"])
def get_series(request):
    """
    Get price history series for one or more markets.
    Returns trade-based data points (prices only change on trades).
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    market_ids = request.GET.getlist("market_ids")
    interval = request.GET.get("interval", "1H").upper()

    if not market_ids:
        return JsonResponse({"error": "market_ids required"}, status=400)

    # Cache key
    cache_key = f"series:{','.join(sorted(market_ids))}:{interval}"
    cached = cache.get(cache_key)
    if cached:
        return JsonResponse(cached, status=200)

    hours = INTERVAL_HOURS.get(interval, 1)
    max_points = MAX_POINTS.get(interval, 100)
    now = timezone.now()
    start_time = now - timedelta(hours=hours)

    # Get Yes options for the markets
    options = list(MarketOption.objects.filter(
        market_id__in=market_ids,
        side="yes",
        is_active=True,
    ).values_list("id", flat=True))

    if not options:
        return JsonResponse({"series": {}}, status=200)

    # Get current prices
    current_prices = {
        str(s["option_id"]): s["prob_bps"]
        for s in MarketOptionStats.objects.filter(option_id__in=options).values("option_id", "prob_bps")
    }

    # Query series data - each row is a trade point
    series = {}
    for opt_id in options:
        # Get trades within time range
        rows = list(MarketOptionSeries.objects.filter(
            option_id=opt_id,
            bucket_start__gte=start_time,
        ).order_by("bucket_start").values("bucket_start", "value_bps")[:max_points])

        points = [
            {"bucket_start": row["bucket_start"].isoformat(), "value_bps": row["value_bps"]}
            for row in rows
        ]

        # If no trades in range, get the last trade before range to draw flat line
        if not points:
            last_before = MarketOptionSeries.objects.filter(
                option_id=opt_id,
                bucket_start__lt=start_time,
            ).order_by("-bucket_start").values("bucket_start", "value_bps").first()

            if last_before:
                # Add point at start of range with last known price
                points.append({
                    "bucket_start": start_time.isoformat(),
                    "value_bps": last_before["value_bps"]
                })

        # Always append current time point to extend line to "now"
        current_bps = current_prices.get(str(opt_id))
        if current_bps is not None:
            points.append({"bucket_start": now.isoformat(), "value_bps": current_bps})

        if points:
            series[str(opt_id)] = points

    result = {"series": series}
    cache.set(cache_key, result, 3)  # Cache for 3 seconds

    return JsonResponse(result, status=200)
