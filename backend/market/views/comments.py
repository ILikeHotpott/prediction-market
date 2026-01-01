import json

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import Comment, Market
from ..services.auth import get_user_from_request
from ..services.comments import build_comment_tree, collect_holdings, serialize_comment


@csrf_exempt
@require_http_methods(["GET", "OPTIONS", "POST"])
def market_comments(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    if request.method == "POST":
        return _create_comment(request, market_id)

    # GET branch
    sort = request.GET.get("sort", "newest") or "newest"
    holders_only = str(request.GET.get("holders_only", "")).lower() in {"1", "true", "yes"}
    newest_first = sort != "oldest"

    qs = (
        Comment.objects.select_related("user")
        .filter(market_id=market_id, status="active")
        .order_by("-created_at" if newest_first else "created_at", "id")
    )
    comments = list(qs)
    user_ids = {c.user_id for c in comments if c.user_id}
    holdings_map = collect_holdings(market_id, user_ids)

    if holders_only:
        comments = [c for c in comments if holdings_map.get(c.user_id)]

    tree, total = build_comment_tree(comments, holdings_map, newest_first=newest_first)
    return JsonResponse({"items": tree, "total": total}, status=200)


def _create_comment(request, market_id):
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        payload = json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    content = (payload.get("content") or "").strip()
    parent_id = payload.get("parent_id")

    if not content:
        return JsonResponse({"error": "content is required"}, status=400)
    if len(content) > 2000:
        return JsonResponse({"error": "content exceeds 2000 characters"}, status=400)

    try:
        market = Market.objects.get(pk=market_id)
    except Market.DoesNotExist:
        return JsonResponse({"error": "Market not found"}, status=404)

    parent = None
    if parent_id:
        try:
            parent = Comment.objects.get(pk=parent_id, market_id=market_id)
        except Comment.DoesNotExist:
            return JsonResponse({"error": "Invalid parent_id"}, status=400)

    comment = Comment.objects.create(
        market=market,
        user=user,
        parent=parent,
        content=content,
        status="active",
        event=market.event,
        created_at=timezone.now(),
        updated_at=timezone.now(),
    )

    holdings_map = collect_holdings(market_id, {user.id})
    data = serialize_comment(comment, holdings_map.get(user.id, []))
    return JsonResponse(data, status=201)

