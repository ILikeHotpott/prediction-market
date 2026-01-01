import json
import math

from django.db import transaction
from django.db.models import Prefetch
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import Market, MarketOption, MarketOptionStats
from ..services.auth import get_user_from_request, require_admin
from ..services.parsing import parse_iso_datetime
from ..services.serializers import serialize_market


ALLOWED_MARKET_STATUSES = {
    "draft",
    "pending",
    "active",
    "closed",
    "resolved",
    "canceled",
}


def _decode_payload(request):
    try:
        return json.loads(request.body.decode() or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"error": "Invalid JSON body"}, status=400)


def _parse_market_payload(payload):
    title = payload.get("title")
    description = payload.get("description")
    trading_deadline = parse_iso_datetime(payload.get("trading_deadline"))
    resolution_deadline = parse_iso_datetime(payload.get("resolution_deadline"))
    options_data = payload.get("options") or []

    if not title or not description or not trading_deadline:
        return None, None, JsonResponse(
            {"error": "title, description, and trading_deadline are required"},
            status=400,
        )
    if not isinstance(options_data, list) or len(options_data) < 2:
        return None, None, JsonResponse({"error": "options must contain at least two items"}, status=400)

    parsed_options = []
    for idx, raw in enumerate(options_data):
        title_val = (raw or {}).get("title") or (raw or {}).get("name")
        if not title_val:
            return None, None, JsonResponse({"error": "each option requires title"}, status=400)
        parsed_options.append(
            MarketOption(
                option_index=idx,
                title=title_val,
                is_active=raw.get("is_active", True),
                onchain_outcome_id=raw.get("onchain_outcome_id"),
            )
        )

    market_fields = {
        "title": title,
        "description": description,
        "trading_deadline": trading_deadline,
        "resolution_deadline": resolution_deadline,
        "category": payload.get("category"),
        "cover_url": payload.get("cover_url"),
        "slug": payload.get("slug"),
        "status": "draft",
        "chain": payload.get("chain"),
        "contract_address": payload.get("contract_address"),
        "onchain_market_id": payload.get("onchain_market_id"),
        "create_tx_hash": payload.get("create_tx_hash"),
        "is_hidden": payload.get("is_hidden", False),
        "sort_weight": payload.get("sort_weight", 0),
        "created_by_id": payload.get("created_by"),
    }
    return market_fields, parsed_options, None


def _create_market_with_options(market_fields, parsed_options):
    with transaction.atomic():
        market = Market.objects.create(**market_fields)
        for opt in parsed_options:
            opt.market = market
        MarketOption.objects.bulk_create(parsed_options)

        option_count = len(parsed_options)
        if option_count:
            per_bps = math.ceil(10000 / option_count / 10) * 10
            stats = []
            now = timezone.now()
            for opt in parsed_options:
                stats.append(
                    MarketOptionStats(
                        option=opt,
                        market=market,
                        prob_bps=per_bps,
                        volume_24h=0,
                        volume_total=0,
                        updated_at=now,
                    )
                )
            MarketOptionStats.objects.bulk_create(stats)
    return market


@require_http_methods(["GET"])
def list_markets(request):
    """Lightweight listing to support admin UI without exposing everything."""
    options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
    markets_qs = Market.objects.order_by("-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    is_admin = False
    user = get_user_from_request(request)
    if user and user.role == "admin":
        is_admin = True
    if not is_admin:
        markets_qs = markets_qs.filter(status="active", is_hidden=False)
    return JsonResponse(
        {"items": [serialize_market(m) for m in markets_qs[:100]]},
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
        user = get_user_from_request(request)
        if not (user and user.role == "admin"):
            return JsonResponse({"error": "Market not available"}, status=404)

    return JsonResponse(serialize_market(market), status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_market(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    admin_error = require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])
    payload, error = _decode_payload(request)
    if error:
        return error

    market_fields, parsed_options, parse_error = _parse_market_payload(payload)
    if parse_error:
        return parse_error

    market = _create_market_with_options(market_fields, parsed_options)

    return JsonResponse(serialize_market(market), status=201)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def publish_market(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    admin_error = require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])
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

    return JsonResponse(serialize_market(market), status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_market_status(request, market_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    admin_error = require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])

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
    return JsonResponse(serialize_market(market), status=200)

