from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.gzip import gzip_page

from ..services.series_service import get_series_data


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
