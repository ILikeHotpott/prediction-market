from collections import defaultdict

from ..models import Position


def serialize_comment(comment, holdings):
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


def collect_holdings(market_id, user_ids):
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


def build_comment_tree(comments, holdings_map, newest_first=True):
    nodes = {}
    roots = []
    for comment in comments:
        serialized = serialize_comment(comment, holdings_map.get(comment.user_id, []))
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


