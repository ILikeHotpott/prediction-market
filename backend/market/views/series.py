from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from ..models import MarketOptionSeries, MarketOption


# Time range in hours and bucket size in seconds for each interval
# All intervals use same bucket size (60s) for consistent trend detail
INTERVAL_CONFIG = {
    "1M": {"hours": 1/60, "bucket_seconds": 5},      # 1 min range, 5s buckets
    "1H": {"hours": 1, "bucket_seconds": 60},        # 1 hour range, 1min buckets
    "4H": {"hours": 4, "bucket_seconds": 60},        # 4 hour range, 1min buckets
    "1D": {"hours": 24, "bucket_seconds": 60},       # 1 day range, 1min buckets
    "1W": {"hours": 168, "bucket_seconds": 60},      # 1 week range, 1min buckets
    "ALL": {"hours": None, "bucket_seconds": 60},    # All time, 1min buckets
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

    Query params:
      - market_ids: one or more market UUIDs
      - interval: 1M, 1H, 4H, 1D, 1W, ALL (default: ALL)

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
    interval = request.GET.get("interval", "ALL").upper()

    if not market_ids:
        return JsonResponse({"error": "market_ids required"}, status=400)

    config = INTERVAL_CONFIG.get(interval, INTERVAL_CONFIG["ALL"])
    hours = config["hours"]
    bucket_seconds = config["bucket_seconds"]
    now = timezone.now()

    # Get all Yes options for the markets
    options = MarketOption.objects.filter(
        market_id__in=market_ids,
        side="yes",
        is_active=True,
    ).values_list("id", flat=True)

    # Query series data
    qs = MarketOptionSeries.objects.filter(option_id__in=options)

    if hours:
        start_time = now - timedelta(hours=hours)
        qs = qs.filter(bucket_start__gte=start_time)

    qs = qs.order_by("option_id", "bucket_start")

    # Group by option_id and collect raw points
    raw_series = {}
    for row in qs:
        opt_id = str(row.option_id)
        if opt_id not in raw_series:
            raw_series[opt_id] = []
        raw_series[opt_id].append({
            "timestamp": int(row.bucket_start.timestamp()),
            "bucket_start": row.bucket_start.isoformat(),
            "value_bps": row.value_bps,
        })

    # Aggregate to appropriate bucket size
    series = {}
    for opt_id, points in raw_series.items():
        aggregated = _aggregate_to_buckets(points, bucket_seconds)
        series[opt_id] = [{"bucket_start": p["bucket_start"], "value_bps": p["value_bps"]} for p in aggregated]

    # If no historical data, add current prices as single points
    if not any(series.values()):
        from ..models import MarketOptionStats
        stats = MarketOptionStats.objects.filter(option_id__in=options)
        for stat in stats:
            opt_id = str(stat.option_id)
            series[opt_id] = [{
                "bucket_start": now.isoformat(),
                "value_bps": stat.prob_bps,
            }]

    return JsonResponse({"series": series}, status=200)
