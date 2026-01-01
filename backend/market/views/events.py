import json
import math

from django.db import transaction
from django.db.models import Prefetch
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import Event, Market, MarketOption, MarketOptionStats
from ..services.auth import get_user_from_request, require_admin
from ..services.events import binary_options_from_payload
from ..services.parsing import parse_iso_datetime
from ..services.serializers import serialize_event


ALLOWED_EVENT_STATUSES = {
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


def _prefetched_event(event_id):
    options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
    markets_qs = Market.objects.order_by("sort_weight", "-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    return (
        Event.objects.prefetch_related(
            Prefetch("markets", queryset=markets_qs, to_attr="prefetched_markets")
        )
        .get(pk=event_id)
    )


def _normalize_markets_payload(payload, title, description, trading_deadline, resolution_deadline):
    event_group_rule = payload.get("group_rule") or "standalone"
    markets_data = payload.get("markets")
    options_data = payload.get("options") or []
    if not isinstance(markets_data, list) or len(markets_data) == 0:
        if options_data:
            markets_data = [
                {"title": (opt or {}).get("title") or (opt or {}).get("name")}
                for opt in options_data
                if (opt or {}).get("title") or (opt or {}).get("name")
            ]
        else:
            markets_data = [{"title": title, "description": description}]

    if len(markets_data) > 1 and event_group_rule == "standalone":
        event_group_rule = "exclusive"

    # Ensure defaults for missing description / deadlines per market
    normalized = []
    for idx, market_data in enumerate(markets_data):
        data = market_data or {}
        normalized.append(
            {
                "title": data.get("title") or title,
                "description": data.get("description") or description,
                "trading_deadline": parse_iso_datetime(data.get("trading_deadline")) or trading_deadline,
                "resolution_deadline": parse_iso_datetime(data.get("resolution_deadline")) or resolution_deadline,
                "category": data.get("category"),
                "cover_url": data.get("cover_url"),
                "slug": data.get("slug"),
                "status": "draft",
                "chain": data.get("chain") or payload.get("chain"),
                "contract_address": data.get("contract_address"),
                "onchain_market_id": data.get("onchain_market_id"),
                "create_tx_hash": data.get("create_tx_hash"),
                "is_hidden": data.get("is_hidden", False),
                "sort_weight": data.get("sort_weight", idx),
                "market_kind": "binary",
                "assertion_text": data.get("assertion_text"),
                "bucket_label": data.get("bucket_label"),
                "options": data.get("options") or [],
            }
        )
    return normalized, event_group_rule


def _create_event_with_markets(event_fields, markets_data, payload, created_by):
    created_markets = []
    with transaction.atomic():
        event = Event.objects.create(**event_fields, created_by_id=created_by)
        for idx, market_data in enumerate(markets_data):
            market = Market.objects.create(
                event=event,
                title=market_data["title"],
                description=market_data["description"],
                trading_deadline=market_data["trading_deadline"],
                resolution_deadline=market_data["resolution_deadline"],
                category=market_data["category"] or payload.get("category"),
                cover_url=market_data["cover_url"] or payload.get("cover_url"),
                slug=market_data["slug"],
                status=market_data["status"],
                chain=market_data["chain"],
                contract_address=market_data["contract_address"],
                onchain_market_id=market_data["onchain_market_id"],
                create_tx_hash=market_data["create_tx_hash"],
                is_hidden=market_data["is_hidden"],
                sort_weight=market_data["sort_weight"],
                created_by_id=created_by,
                market_kind=market_data["market_kind"],
                assertion_text=market_data["assertion_text"],
                bucket_label=market_data["bucket_label"],
            )

            raw_options = market_data.get("options") or []
            parsed_options = binary_options_from_payload(raw_options)
            for opt in parsed_options:
                opt.market = market
            MarketOption.objects.bulk_create(parsed_options)

            stats = []
            now = timezone.now()
            per_bps = math.ceil(10000 / len(parsed_options) / 10) * 10 if parsed_options else 5000
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
            created_markets.append(market)

        if created_markets:
            event.primary_market = created_markets[0]
            event.save(update_fields=["primary_market", "updated_at"])

    return event


@require_http_methods(["GET"])
def list_events(request):
    """
    Lightweight listing for homepage cards (events with primary market snapshot).
    """
    options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
    is_admin = False
    user = get_user_from_request(request)
    if user and user.role == "admin":
        is_admin = True

    markets_qs = Market.objects.order_by("sort_weight", "-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    if not is_admin:
        markets_qs = markets_qs.filter(status="active", is_hidden=False)

    events_qs = Event.objects.order_by("-sort_weight", "-created_at").prefetch_related(
        Prefetch("markets", queryset=markets_qs, to_attr="prefetched_markets")
    )
    if not is_admin and not request.GET.get("all"):
        events_qs = events_qs.filter(status="active", is_hidden=False)

    items = [serialize_event(e) for e in events_qs[:100]]
    return JsonResponse({"items": items}, status=200)


@require_http_methods(["GET"])
def get_event(request, event_id):
    try:
        event = _prefetched_event(event_id)
    except Event.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)

    if event.status != "active" or event.is_hidden:
        user = get_user_from_request(request)
        if not (user and user.role == "admin"):
            return JsonResponse({"error": "Event not available"}, status=404)

    return JsonResponse(serialize_event(event), status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_event(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    admin_error = require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])

    payload, error = _decode_payload(request)
    if error:
        return error

    title = payload.get("title")
    description = payload.get("description")
    if not title or not description:
        return JsonResponse({"error": "title and description are required"}, status=400)

    trading_deadline = parse_iso_datetime(payload.get("trading_deadline"))
    resolution_deadline = parse_iso_datetime(payload.get("resolution_deadline"))
    markets_data, event_group_rule = _normalize_markets_payload(
        payload, title, description, trading_deadline, resolution_deadline
    )
    created_by = payload.get("created_by")
    event_fields = {
        "title": title,
        "description": description,
        "cover_url": payload.get("cover_url"),
        "category": payload.get("category"),
        "slug": payload.get("slug"),
        "status": "draft",
        "sort_weight": payload.get("sort_weight", 0),
        "is_hidden": payload.get("is_hidden", False),
        "group_rule": event_group_rule,
        "trading_deadline": trading_deadline,
        "resolution_deadline": resolution_deadline,
    }

    event = _create_event_with_markets(event_fields, markets_data, payload, created_by)
    event = _prefetched_event(event.id)
    return JsonResponse(serialize_event(event), status=201)


@csrf_exempt
def publish_event(request, event_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    admin_error = require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])

    try:
        event = Event.objects.get(pk=event_id)
    except Event.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)

    if event.status not in {"draft", "pending"}:
        return JsonResponse(
            {"error": f"Cannot publish event in status '{event.status}'"}, status=400
        )

    now = timezone.now()
    with transaction.atomic():
        event.status = "active"
        event.updated_at = now
        event.save(update_fields=["status", "updated_at"])
        Market.objects.filter(event=event).update(status="active", updated_at=now)

    event = _prefetched_event(event_id)
    return JsonResponse(serialize_event(event), status=200)


@csrf_exempt
def update_event_status(request, event_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    admin_error = require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])

    payload, error = _decode_payload(request)
    if error:
        return error

    new_status = payload.get("status")
    if new_status not in ALLOWED_EVENT_STATUSES:
        return JsonResponse({"error": "Invalid status"}, status=400)

    try:
        event = Event.objects.get(pk=event_id)
    except Event.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)

    now = timezone.now()
    with transaction.atomic():
        event.status = new_status
        event.updated_at = now
        event.save(update_fields=["status", "updated_at"])
        # keep markets in sync for active/closed/resolved/canceled
        if new_status in {"active", "closed", "resolved", "canceled"}:
            Market.objects.filter(event=event).update(status=new_status, updated_at=now)

    event = _prefetched_event(event_id)
    return JsonResponse(serialize_event(event), status=200)

