from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from ..models import MarketOptionSeries, MarketOption


INTERVAL_HOURS = {
    "1M": 1/60,
    "1H": 1,
    "4H": 4,
    "1D": 24,
    "1W": 168,
    "ALL": None,
}


@require_http_methods(["GET", "OPTIONS"])
def get_series(request):
    """
    Get price history series for one or more markets.

    Query params:
      - market_ids: one or more market UUIDs
      - interval: 1H, 6H, 1D, 1W, ALL (default: ALL)

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

    # Get time range
    hours = INTERVAL_HOURS.get(interval)
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

    # Group by option_id
    series = {}
    for row in qs:
        opt_id = str(row.option_id)
        if opt_id not in series:
            series[opt_id] = []
        series[opt_id].append({
            "bucket_start": row.bucket_start.isoformat(),
            "value_bps": row.value_bps,
        })

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
