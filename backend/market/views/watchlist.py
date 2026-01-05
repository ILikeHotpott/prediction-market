from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from market.models import Watchlist, Event, User


def get_user_from_request(request):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None


@require_http_methods(["GET"])
def list_watchlist(request):
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    items = Watchlist.objects.filter(user=user).select_related("event")
    event_ids = [str(item.event_id) for item in items]
    return JsonResponse({"event_ids": event_ids})


@csrf_exempt
@require_http_methods(["POST"])
def add_to_watchlist(request, event_id):
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)

    Watchlist.objects.get_or_create(user=user, event=event)
    return JsonResponse({"success": True, "event_id": str(event_id)})


@csrf_exempt
@require_http_methods(["DELETE"])
def remove_from_watchlist(request, event_id):
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    Watchlist.objects.filter(user=user, event_id=event_id).delete()
    return JsonResponse({"success": True, "event_id": str(event_id)})


@csrf_exempt
@require_http_methods(["POST"])
def toggle_watchlist(request, event_id):
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)

    existing = Watchlist.objects.filter(user=user, event=event).first()
    if existing:
        existing.delete()
        return JsonResponse({"success": True, "event_id": str(event_id), "is_watched": False})
    else:
        Watchlist.objects.create(user=user, event=event)
        return JsonResponse({"success": True, "event_id": str(event_id), "is_watched": True})
