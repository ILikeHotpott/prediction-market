import json
from collections import defaultdict

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import Comment, Market, Position
from .common import _get_user_from_request


def _serialize_comment(comment, holdings):
    user = getattr(comment, "user", None)
    return {
        "id": comment.id,
        "parent_id": comment.parent_id,
        "content": comment.content,
        "status": comment.status,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "edited_at": comment.edited_at.isoformat() if comment.edited_at else None,
        "user": {
            "id": str(user.id) if user else None,
            "display_name": user.display_name if user else None,
            "avatar_url": user.avatar_url if user else None,
        },
        "holdings": holdings,
        "replies": [],
    }


def _collect_holdings(market_id, user_ids):
    if not user_ids:
        return {}
    holdings = defaultdict(list)
    positions = (
        Position.objects.select_related("option", "option__stats")
        .filter(market_id=market_id, user_id__in=user_ids, shares__gt=0)
        .order_by("option__option_index", "option_id")
    )
    for pos in positions:
        option = getattr(pos, "option", None)
        stats = getattr(option, "stats", None) if option else None
        holdings[pos.user_id].append(
            {
                "option_id": pos.option_id,
                "option_title": option.title if option else None,
                "option_index": option.option_index if option else None,
                "shares": str(pos.shares),
                "cost_basis": str(pos.cost_basis),
                "probability_bps": stats.prob_bps if stats else None,
                "side": option.side if option else None,
            }
        )
    return holdings


def _build_tree(comments, holdings_map, newest_first=True):
    nodes = {}
    roots = []
    for comment in comments:
        serialized = _serialize_comment(comment, holdings_map.get(comment.user_id, []))
        nodes[comment.id] = serialized

    for node in nodes.values():
        parent_id = node["parent_id"]
        if parent_id and parent_id in nodes:
            nodes[parent_id]["replies"].append(node)
        else:
            roots.append(node)

    def sort_children(items):
        items.sort(
            key=lambda x: (x["created_at"] or ""),
            reverse=newest_first,
        )
        for child in items:
            if child["replies"]:
                sort_children(child["replies"])

    sort_children(roots)
    return roots, len(nodes)


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
    holdings_map = _collect_holdings(market_id, user_ids)

    if holders_only:
        comments = [c for c in comments if holdings_map.get(c.user_id)]

    tree, total = _build_tree(comments, holdings_map, newest_first=newest_first)
    return JsonResponse({"items": tree, "total": total}, status=200)


def _create_comment(request, market_id):
    user = _get_user_from_request(request)
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

    holdings_map = _collect_holdings(market_id, {user.id})
    data = _serialize_comment(comment, holdings_map.get(user.id, []))
    return JsonResponse(data, status=201)

