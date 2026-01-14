from datetime import timedelta

from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from django.db.models import Q

from ..models import MarketOptionSeries, MarketOption


# Optimized config: reduce data points for longer intervals
INTERVAL_CONFIG = {
    "1M": {"hours": 1/60, "bucket_seconds": 5, "max_points": 12},      # 1 min, 5s buckets, max 12 points
    "1H": {"hours": 1, "bucket_seconds": 60, "max_points": 60},        # 1 hour, 1min buckets, max 60 points
    "4H": {"hours": 4, "bucket_seconds": 300, "max_points": 48},       # 4 hours, 5min buckets, max 48 points
    "1D": {"hours": 24, "bucket_seconds": 1800, "max_points": 48},     # 1 day, 30min buckets, max 48 points
    "1W": {"hours": 168, "bucket_seconds": 10800, "max_points": 56},   # 1 week, 3hr buckets, max 56 points
    "ALL": {"hours": 720, "bucket_seconds": 43200, "max_points": 60},  # 30 days, 12hr buckets, max 60 points
}


def _aggregate_to_buckets(points, bucket_seconds):
    """Aggregate raw points into larger time buckets, taking the last value in each bucket."""
    if not points or bucket_seconds <= 5:
        return points

    buckets = {}
    for p in points:
        bucket_ts = (p["timestamp"] // bucket_seconds) * bucket_seconds
        # Keep the latest value in each bucket
        if bucket_ts not in buckets or p["timestamp"] > buckets[bucket_ts]["timestamp"]:
            buckets[bucket_ts] = p

    return sorted(buckets.values(), key=lambda x: x["timestamp"])


@require_http_methods(["GET", "OPTIONS"])
def get_series(request):
    """
    Get price history series for one or more markets.
    Optimized with caching and minimal data transfer.

    Query params:
      - market_ids: one or more market UUIDs
      - interval: 1M, 1H, 4H, 1D, 1W, ALL (default: 1H)

    Returns:
      {
        "series": {
          "<option_id>": [
            {"bucket_start": "...", "value_bps": 5000},
            ...
          ]
        }
      }
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    market_ids = request.GET.getlist("market_ids")
    interval = request.GET.get("interval", "1H").upper()

    if not market_ids:
        return JsonResponse({"error": "market_ids required"}, status=400)

    # Cache key based on markets and interval
    cache_key = f"series:{','.join(sorted(market_ids))}:{interval}"
    cached = cache.get(cache_key)
    if cached:
        return JsonResponse(cached, status=200)

    config = INTERVAL_CONFIG.get(interval, INTERVAL_CONFIG["1H"])
    hours = config["hours"]
    bucket_seconds = config["bucket_seconds"]
    max_points = config["max_points"]
    now = timezone.now()

    # Get all Yes options for the markets (only fetch IDs)
    options = list(MarketOption.objects.filter(
        market_id__in=market_ids,
        side="yes",
        is_active=True,
    ).values_list("id", flat=True))

    if not options:
        return JsonResponse({"series": {}}, status=200)

    # Calculate time range
    start_time = now - timedelta(hours=hours)

    # Query series data - ONLY fetch needed columns and limit per option
    raw_series = {}
    for opt_id in options:
        # Per-option query with limit to prevent one option from dominating
        rows = MarketOptionSeries.objects.filter(
            option_id=opt_id,
            bucket_start__gte=start_time,
        ).order_by("-bucket_start").values("bucket_start", "value_bps")[:max_points]

        if rows:
            raw_series[str(opt_id)] = [
                {
                    "timestamp": int(row["bucket_start"].timestamp()),
                    "bucket_start": row["bucket_start"].isoformat(),
                    "value_bps": row["value_bps"],
                }
                for row in reversed(list(rows))  # Reverse to get chronological order
            ]

    # Aggregate to appropriate bucket size
    series = {}
    for opt_id, points in raw_series.items():
        aggregated = _aggregate_to_buckets(points, bucket_seconds)
        # Further limit to max_points after aggregation
        if len(aggregated) > max_points:
            # Sample evenly across the range
            step = len(aggregated) / max_points
            aggregated = [aggregated[int(i * step)] for i in range(max_points)]
        series[opt_id] = [{"bucket_start": p["bucket_start"], "value_bps": p["value_bps"]} for p in aggregated]

    # If no historical data, add current prices as single points
    if not series:
        from ..models import MarketOptionStats
        stats = MarketOptionStats.objects.filter(option_id__in=options).values("option_id", "prob_bps")
        for stat in stats:
            opt_id = str(stat["option_id"])
            series[opt_id] = [{
                "bucket_start": now.isoformat(),
                "value_bps": stat["prob_bps"],
            }]

    result = {"series": series}

    # Cache for 5 seconds (balance freshness vs load)
    cache.set(cache_key, result, 5)

    return JsonResponse(result, status=200)
