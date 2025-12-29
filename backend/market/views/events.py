import json
import math

from django.db import transaction
from django.db.models import Prefetch
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import Event, Market, MarketOption, MarketOptionStats
from .common import (
    _get_user_from_request,
    _parse_datetime,
    _require_admin,
    _serialize_event,
)


ALLOWED_EVENT_STATUSES = {
    "draft",
    "pending",
    "active",
    "closed",
    "resolved",
    "canceled",
}


def _binary_options_from_payload(options_data):
    """
    Ensure a market has YES/NO options with sides and default pricing.
    Caller will create stats with equal split.
    """
    if not isinstance(options_data, list) or len(options_data) == 0:
        return [
            MarketOption(option_index=0, title="NO", side="no"),
            MarketOption(option_index=1, title="YES", side="yes"),
        ]

    opts = []
    for idx, raw in enumerate(options_data):
        title_val = (raw or {}).get("title") or (raw or {}).get("name")
        side_val = (raw or {}).get("side")
        if not title_val:
            continue
        opts.append(
            MarketOption(
                option_index=idx,
                title=title_val,
                is_active=raw.get("is_active", True),
                onchain_outcome_id=raw.get("onchain_outcome_id"),
                side=side_val,
            )
        )

    # force YES/NO presence and trim to binary
    yes_opt = next((o for o in opts if (o.side or "").lower() == "yes"), None)
    no_opt = next((o for o in opts if (o.side or "").lower() == "no"), None)

    if not no_opt:
        no_opt = MarketOption(option_index=0, title="NO", side="no", is_active=True)
    if not yes_opt:
        yes_opt = MarketOption(option_index=1, title="YES", side="yes", is_active=True)

    binary_opts = [no_opt, yes_opt]
    for idx, opt in enumerate(binary_opts):
        opt.option_index = idx
    return binary_opts


@require_http_methods(["GET"])
def list_events(request):
    """
    Lightweight listing for homepage cards (events with primary market snapshot).
    """
    options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
    is_admin = False
    user = _get_user_from_request(request)
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

    items = [_serialize_event(e) for e in events_qs[:100]]
    return JsonResponse({"items": items}, status=200)


@require_http_methods(["GET"])
def get_event(request, event_id):
    options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
    markets_qs = Market.objects.order_by("sort_weight", "-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    try:
        event = (
            Event.objects.prefetch_related(
                Prefetch("markets", queryset=markets_qs, to_attr="prefetched_markets")
            )
            .get(pk=event_id)
        )
    except Event.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)

    if event.status != "active" or event.is_hidden:
        user = _get_user_from_request(request)
        if not (user and user.role == "admin"):
            return JsonResponse({"error": "Event not available"}, status=404)

    return JsonResponse(_serialize_event(event), status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_event(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    admin_error = _require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])

    try:
        payload = json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    title = payload.get("title")
    description = payload.get("description")
    if not title or not description:
        return JsonResponse({"error": "title and description are required"}, status=400)

    event_group_rule = payload.get("group_rule") or "standalone"
    trading_deadline = _parse_datetime(payload.get("trading_deadline"))
    resolution_deadline = _parse_datetime(payload.get("resolution_deadline"))

    markets_data = payload.get("markets")
    options_data = payload.get("options") or []
    # Backward compatibility: if only options are provided, treat each option as a child market.
    if not isinstance(markets_data, list) or len(markets_data) == 0:
        if options_data:
            markets_data = [
                {"title": (opt or {}).get("title") or (opt or {}).get("name")}
                for opt in options_data
                if (opt or {}).get("title") or (opt or {}).get("name")
            ]
        else:
            markets_data = [{"title": title}]

    if len(markets_data) > 1 and event_group_rule == "standalone":
        event_group_rule = "exclusive"

    created_by = payload.get("created_by")
    created_markets = []
    with transaction.atomic():
        event = Event.objects.create(
            title=title,
            description=description,
            cover_url=payload.get("cover_url"),
            category=payload.get("category"),
            slug=payload.get("slug"),
            status="draft",
            sort_weight=payload.get("sort_weight", 0),
            is_hidden=payload.get("is_hidden", False),
            group_rule=event_group_rule,
            trading_deadline=trading_deadline,
            resolution_deadline=resolution_deadline,
            created_by_id=created_by,
        )

        for idx, market_data in enumerate(markets_data):
            m_title = (market_data or {}).get("title") or title
            m_desc = (market_data or {}).get("description") or description
            m_td = _parse_datetime((market_data or {}).get("trading_deadline")) or trading_deadline
            m_rd = _parse_datetime((market_data or {}).get("resolution_deadline")) or resolution_deadline
            market = Market.objects.create(
                event=event,
                title=m_title,
                description=m_desc,
                trading_deadline=m_td,
                resolution_deadline=m_rd,
                category=market_data.get("category") or payload.get("category"),
                cover_url=market_data.get("cover_url") or payload.get("cover_url"),
                slug=market_data.get("slug"),
                status="draft",
                chain=market_data.get("chain") or payload.get("chain"),
                contract_address=market_data.get("contract_address"),
                onchain_market_id=market_data.get("onchain_market_id"),
                create_tx_hash=market_data.get("create_tx_hash"),
                is_hidden=market_data.get("is_hidden", False),
                sort_weight=market_data.get("sort_weight", idx),
                created_by_id=created_by,
                market_kind="binary",
                assertion_text=market_data.get("assertion_text"),
                bucket_label=market_data.get("bucket_label"),
            )

            raw_options = market_data.get("options") or []
            parsed_options = _binary_options_from_payload(raw_options)
            for opt in parsed_options:
                opt.market = market
            MarketOption.objects.bulk_create(parsed_options)

            # Default stats split 50/50
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

        # Set primary market if not provided
        if created_markets:
            event.primary_market = created_markets[0]
            event.save(update_fields=["primary_market", "updated_at"])

    options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
    markets_qs = Market.objects.order_by("sort_weight", "-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    event = (
        Event.objects.prefetch_related(
            Prefetch("markets", queryset=markets_qs, to_attr="prefetched_markets")
        )
        .get(pk=event.id)
    )
    return JsonResponse(_serialize_event(event), status=201)


@csrf_exempt
def publish_event(request, event_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    admin_error = _require_admin(request)
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

    options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
    markets_qs = Market.objects.order_by("sort_weight", "-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    event = (
        Event.objects.prefetch_related(
            Prefetch("markets", queryset=markets_qs, to_attr="prefetched_markets")
        )
        .get(pk=event_id)
    )
    return JsonResponse(_serialize_event(event), status=200)


@csrf_exempt
def update_event_status(request, event_id):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    admin_error = _require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])

    try:
        payload = json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

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

    options_qs = MarketOption.objects.prefetch_related("stats").order_by("option_index")
    markets_qs = Market.objects.order_by("sort_weight", "-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    event = (
        Event.objects.prefetch_related(
            Prefetch("markets", queryset=markets_qs, to_attr="prefetched_markets")
        )
        .get(pk=event_id)
    )
    return JsonResponse(_serialize_event(event), status=200)

