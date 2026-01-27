from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods


@require_http_methods(["GET"])
def finance_series(request):
    symbol = str(request.GET.get("symbol") or "").upper()
    if not symbol:
        return JsonResponse({"error": "symbol is required"}, status=400)

    series = cache.get(f"finance_series:{symbol}") or []
    snapshot = cache.get(f"finance_price:{symbol}") or {}

    return JsonResponse(
        {
            "symbol": symbol,
            "points": series,
            "latest": snapshot,
        },
        status=200,
    )
