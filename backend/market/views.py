import json

from django.db import transaction
from django.db.models import Prefetch
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Market, MarketOption, User

ALLOWED_MARKET_STATUSES = {
    "draft",
    "pending",
    "active",
    "closed",
    "resolved",
    "canceled",
}

def _parse_datetime(value: str):
    if not value:
        return None
    dt = parse_datetime(value)
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def _serialize_option(option: MarketOption):
    probability_bps = None
    if hasattr(option, "stats") and option.stats:
        probability_bps = option.stats.prob_bps

    return {
        "id": option.id,
        "title": option.title,
        "option_index": option.option_index,
        "probability_bps": probability_bps,
        "probability": round(probability_bps / 100, 2) if probability_bps is not None else None,
    }


def _serialize_market(market: Market):
    options = []
    if hasattr(market, "prefetched_options"):
        options = market.prefetched_options
    elif hasattr(market, "options"):
        options = list(market.options.all())

    option_payload = [_serialize_option(o) for o in options]
    is_binary = len(option_payload) == 2

    return {
        "id": str(market.id),
        "title": market.title,
        "description": market.description,
        "status": market.status,
        "category": market.category,
        "cover_url": market.cover_url,
        "is_hidden": market.is_hidden,
        "is_binary": is_binary,
        "trading_deadline": market.trading_deadline.isoformat()
        if market.trading_deadline
        else None,
        "resolution_deadline": market.resolution_deadline.isoformat()
        if market.resolution_deadline
        else None,
        "slug": market.slug,
        "created_at": market.created_at.isoformat() if market.created_at else None,
        "updated_at": market.updated_at.isoformat() if market.updated_at else None,
        "options": option_payload,
    }


def _get_user_from_request(request):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None
    try:
        return User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return None


def _require_admin(request):
    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    if user.role != "admin":
        return JsonResponse({"error": "Forbidden"}, status=403)
    return None


@require_http_methods(["GET"])
def list_markets(request):
    """Lightweight listing to support admin UI without exposing everything."""
    options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
    markets_qs = Market.objects.order_by("-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    is_admin = False
    user = _get_user_from_request(request)
    if user and user.role == "admin":
        is_admin = True
    if not is_admin:
        markets_qs = markets_qs.filter(status="active", is_hidden=False)
    return JsonResponse(
        {"items": [_serialize_market(m) for m in markets_qs[:100]]},
        status=200,
    )


@require_http_methods(["GET"])
def get_market(request, market_id):
    try:
        options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
        market = (
            Market.objects.prefetch_related(
                Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
            )
            .get(pk=market_id)
        )
    except Market.DoesNotExist:
        return JsonResponse({"error": "Market not found"}, status=404)

    if market.status != "active" or market.is_hidden:
        user = _get_user_from_request(request)
        if not (user and user.role == "admin"):
            return JsonResponse({"error": "Market not available"}, status=404)

    return JsonResponse(_serialize_market(market), status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_market(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    admin_error = _require_admin(request)
    if admin_error:
        return admin_error
    try:
        payload = json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    title = payload.get("title")
    description = payload.get("description")
    trading_deadline = _parse_datetime(payload.get("trading_deadline"))
    resolution_deadline = _parse_datetime(payload.get("resolution_deadline"))
    options_data = payload.get("options") or []

    if not title or not description or not trading_deadline:
        return JsonResponse(
            {
                "error": "title, description, and trading_deadline are required",
            },
            status=400,
        )

    if not isinstance(options_data, list) or len(options_data) < 2:
        return JsonResponse({"error": "options must contain at least two items"}, status=400)

    parsed_options = []
    for idx, raw in enumerate(options_data):
        title_val = (raw or {}).get("title") or (raw or {}).get("name")
        if not title_val:
            return JsonResponse({"error": "each option requires title"}, status=400)
        parsed_options.append(
            MarketOption(
                option_index=idx,  # enforce sequential per market
                title=title_val,
                is_active=raw.get("is_active", True),
                onchain_outcome_id=raw.get("onchain_outcome_id"),
            )
        )

    with transaction.atomic():
        market = Market(
            title=title,
            description=description,
            trading_deadline=trading_deadline,
            resolution_deadline=resolution_deadline,
            category=payload.get("category"),
            cover_url=payload.get("cover_url"),
            slug=payload.get("slug"),
            status="draft",
            chain=payload.get("chain"),
            contract_address=payload.get("contract_address"),
            onchain_market_id=payload.get("onchain_market_id"),
            create_tx_hash=payload.get("create_tx_hash"),
            is_hidden=payload.get("is_hidden", False),
            sort_weight=payload.get("sort_weight", 0),
            created_by_id=payload.get("created_by"),
        )
        market.save()

        for opt in parsed_options:
            opt.market = market
        MarketOption.objects.bulk_create(parsed_options)

    return JsonResponse(_serialize_market(market), status=201)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def publish_market(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    admin_error = _require_admin(request)
    if admin_error:
        return admin_error
    try:
        market = Market.objects.get(pk=market_id)
    except Market.DoesNotExist:
        return JsonResponse({"error": "Market not found"}, status=404)

    if market.status not in {"draft", "pending"}:
        return JsonResponse(
            {"error": f"Cannot publish market in status '{market.status}'"}, status=400
        )

    market.status = "active"
    market.updated_at = timezone.now()
    market.save(update_fields=["status", "updated_at"])

    return JsonResponse(_serialize_market(market), status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_market_status(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    admin_error = _require_admin(request)
    if admin_error:
        return admin_error

    try:
        payload = json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    new_status = payload.get("status")
    if new_status not in ALLOWED_MARKET_STATUSES:
        return JsonResponse({"error": "Invalid status"}, status=400)

    try:
        market = Market.objects.get(pk=market_id)
    except Market.DoesNotExist:
        return JsonResponse({"error": "Market not found"}, status=404)

    market.status = new_status
    market.updated_at = timezone.now()
    market.save(update_fields=["status", "updated_at"])
    return JsonResponse(_serialize_market(market), status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def sync_user(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    try:
        payload = json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    user_id = payload.get("id")
    if not user_id:
        return JsonResponse({"error": "id is required"}, status=400)

    now = timezone.now()
    payload_role = payload.get("role")
    defaults = {
        "display_name": payload.get("display_name") or "",
        "avatar_url": payload.get("avatar_url"),
        # If caller doesn't provide role, keep existing role (if any) and default to "user" only on creation.
        "role": payload_role if payload_role else None,
        "updated_at": now,
    }

    user, created = User.objects.get_or_create(
        id=user_id,
        defaults={
            "display_name": defaults["display_name"],
            "avatar_url": defaults["avatar_url"],
            "role": defaults["role"] or "user",
            "created_at": now,
            "updated_at": now,
        },
    )

    if not created:
        update_fields = ["display_name", "avatar_url", "updated_at"]
        user.display_name = defaults["display_name"]
        user.avatar_url = defaults["avatar_url"]
        user.updated_at = now
        if payload_role:
            user.role = payload_role
            update_fields.append("role")
        user.save(update_fields=update_fields)

    return JsonResponse(
        {"id": str(user.id), "role": user.role, "display_name": user.display_name},
        status=200,
    )


@require_http_methods(["GET", "OPTIONS"])
def me(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    return JsonResponse(
        {
            "id": str(user.id),
            "role": user.role,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
        },
        status=200,
    )
