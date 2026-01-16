from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.gzip import gzip_page

from ..services.series_service import get_series_data, get_series_incremental


@gzip_page
@require_http_methods(["GET", "OPTIONS"])
def get_series(request):
    """
    Get price history series for one or more markets.
    Returns trade-based data points (prices only change on trades).
    Compressed with gzip for faster transfer.
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    market_ids = request.GET.getlist("market_ids")
    interval = request.GET.get("interval", "1H")

    if not market_ids:
        return JsonResponse({"error": "market_ids required"}, status=400)

    result = get_series_data(market_ids, interval)
    response = JsonResponse(result, status=200)

    # Add cache headers for CDN/browser caching (longer cache to reduce bandwidth)
    response["Cache-Control"] = "public, max-age=120, stale-while-revalidate=300"
    response["Vary"] = "Accept-Encoding"

    return response


@gzip_page
@require_http_methods(["GET", "OPTIONS"])
def get_series_delta(request):
    """
    Get incremental series data after a specific timestamp (A2 optimization).

    Usage:
    1. First call: GET /api/series/?market_ids=xxx&interval=1H (full data)
    2. Subsequent calls: GET /api/series/delta/?market_ids=xxx&after=<last_bucket_start>

    This returns only new points since the given timestamp, typically 1-5 rows
    instead of 60-200 rows, reducing egress by 90%+.
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    market_ids = request.GET.getlist("market_ids")
    after_timestamp = request.GET.get("after")
    limit = request.GET.get("limit", "100")

    if not market_ids:
        return JsonResponse({"error": "market_ids required"}, status=400)

    if not after_timestamp:
        return JsonResponse({"error": "after timestamp required"}, status=400)

    try:
        limit = min(int(limit), 500)
    except ValueError:
        limit = 100

    result = get_series_incremental(market_ids, after_timestamp, limit)
    response = JsonResponse(result, status=200)

    # Short cache for incremental updates
    response["Cache-Control"] = "public, max-age=30"
    response["Vary"] = "Accept-Encoding"

    return response
