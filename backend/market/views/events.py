import json
import logging
from typing import Any, Dict, List, Tuple, Optional

from django.db import transaction
from django.db.models import Prefetch
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import Event, Market, MarketOption, MarketOptionStats, EventTranslation
from ..services.amm.setup import AmmSetupError, ensure_pool_initialized, normalize_amm_params
from ..services.auth import get_user_from_request, require_admin
from ..services.events import binary_options_from_payload
from ..services.parsing import parse_iso_datetime
from ..services.serializers import serialize_event
from ..services.cache import (
    get_cached_event_list, set_cached_event_list,
    get_cached_event_detail, set_cached_event_detail,
    invalidate_event_list, invalidate_event_detail, invalidate_on_event_change,
)

logger = logging.getLogger(__name__)


def _index_event_async(event_data: dict):
    """Index event to meilisearch (fire and forget)."""
    try:
        from ..services.search import index_event
        index_event(event_data)
    except Exception as e:
        logger.warning("Failed to index event %s: %s", event_data.get("id"), e)


def _reindex_all_events_async():
    """Reindex all events to meilisearch (fire and forget)."""
    try:
        from ..services.search import index_events
        # Only index active/closed/resolved events; exclude canceled/draft/pending
        # to avoid re-adding events that were explicitly deleted from the index
        events = Event.objects.filter(
            is_hidden=False,
            status__in=["active", "closed", "resolved"],
        ).select_related("primary_market")
        docs = []
        for event in events:
            market = event.primary_market
            volume = 0
            outcomes = []
            if market:
                stats = MarketOptionStats.objects.filter(market_id=market.id)
                volume = sum(float(s.volume_total or 0) for s in stats)
                options = MarketOption.objects.filter(market_id=market.id)
                for opt in options:
                    stat = next((s for s in stats if s.option_id == opt.id), None)
                    outcomes.append({
                        "id": opt.id,
                        "name": opt.title,
                        "probability_bps": stat.prob_bps if stat else 0,
                    })
            docs.append({
                "id": str(event.id),
                "title": event.title,
                "description": event.description or "",
                "category": event.category or "",
                "status": event.status,
                "cover_url": event.cover_url,
                "created_at": event.created_at.timestamp() if event.created_at else 0,
                "trading_deadline": event.trading_deadline.timestamp() if event.trading_deadline else 0,
                "volume_total": volume,
                "market_id": str(market.id) if market else None,
                "outcomes": outcomes,
            })
        index_events(docs)
        logger.info("Reindexed %d events to meilisearch", len(docs))
    except Exception as e:
        logger.warning("Failed to reindex all events: %s", e)


def _delete_event_index_async(event_id: str):
    """Delete event from meilisearch index (fire and forget)."""
    try:
        from ..services.search import delete_event
        delete_event(event_id)
    except Exception as e:
        logger.warning("Failed to delete event %s from index: %s", event_id, e)

ALLOWED_EVENT_STATUSES = {
    "draft",
    "pending",
    "active",
    "closed",
    "resolved",
    "canceled",
}

ALLOWED_GROUP_RULES = {"standalone", "exclusive", "independent"}


def _decode_payload(request):
    try:
        return json.loads(request.body.decode() or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"error": "Invalid JSON body"}, status=400)


def _prefetched_event(event_id):
    # Use select_related for stats (OneToOne) instead of prefetch_related to avoid N+1
    options_qs = MarketOption.objects.select_related("stats").order_by("option_index")
    markets_qs = Market.objects.order_by("sort_weight", "-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    translations_qs = EventTranslation.objects.all()
    return (
        Event.objects.prefetch_related(
            Prefetch("markets", queryset=markets_qs, to_attr="prefetched_markets"),
            Prefetch("translations", queryset=translations_qs, to_attr="prefetched_translations")
        )
        .get(pk=event_id)
    )


def _split_bps(total: int, n: int) -> List[int]:
    """Split total into n ints such that sum == total, deterministic."""
    if n <= 0:
        return []
    base, rem = divmod(total, n)
    return [base + (1 if i < rem else 0) for i in range(n)]


def _derive_group_rule(payload: Dict[str, Any], markets_data: List[Dict[str, Any]], options_data: List[Dict[str, Any]]) -> str:
    """
    Backward compatible + safe:
      - If payload.group_rule provided: validate and use.
      - Else if markets were inferred from payload.options (no explicit markets list): treat as 'exclusive'.
      - Else if explicit markets list has len>1: default to 'independent'.
      - Else: 'standalone'.
    """
    explicit = payload.get("group_rule")
    if explicit is not None:
        rule = str(explicit).strip().lower()
        if rule not in ALLOWED_GROUP_RULES:
            raise ValueError("Invalid group_rule")
        return rule

    has_explicit_markets = isinstance(payload.get("markets"), list) and len(payload.get("markets") or []) > 0
    inferred_from_options = (not has_explicit_markets) and bool(options_data)

    if inferred_from_options:
        return "exclusive"

    if has_explicit_markets and len(markets_data) > 1:
        return "independent"

    return "standalone"


def _normalize_markets_payload(payload, title, description, trading_deadline, resolution_deadline):
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

    event_group_rule = _derive_group_rule(payload, markets_data, options_data)

    # Safety: standalone must be single-market; reject ambiguity instead of silently coercing.
    if event_group_rule == "standalone" and len(markets_data) > 1:
        raise ValueError("group_rule='standalone' requires exactly 1 market. Use 'independent' or 'exclusive'.")

    defaults = {
        "title": title,
        "description": description,
        "status": "draft",
        "market_kind": "binary",
        "options": [],
        "amm": None,
        "category": None,
        "cover_url": None,
        "slug": None,
        "contract_address": None,
        "onchain_market_id": None,
        "create_tx_hash": None,
        "is_hidden": False,
        "assertion_text": None,
        "bucket_label": None,
        "sort_weight": 0,
        "chain": payload.get("chain"),
    }

    normalized = []
    for idx, market_data in enumerate(markets_data):
        data = market_data or {}
        normalized.append(
            {
                **defaults,
                **data,  # allow per-market overrides
                "title": data.get("title") or title,
                "description": data.get("description") or description,
                "trading_deadline": parse_iso_datetime(data.get("trading_deadline")) or trading_deadline,
                "resolution_deadline": parse_iso_datetime(data.get("resolution_deadline")) or resolution_deadline,
                "chain": data.get("chain") or payload.get("chain"),
                "is_hidden": data.get("is_hidden", False),
                "sort_weight": data.get("sort_weight", idx),
                "options": data.get("options") or [],
                "amm": data.get("amm"),  # FIX: correct key placement
            }
        )

    return normalized, event_group_rule


def _pick_yes_no_options(options: List[MarketOption]) -> Tuple[Optional[MarketOption], Optional[MarketOption], bool]:
    """
    Returns (yes_opt, no_opt, used_fallback).

    Strategy:
      - Prefer side='yes'/'no' if present.
      - Else fallback to option_index ordering (assume index 0 is YES, index 1 is NO) and mark used_fallback=True.
    """
    yes_opt = next((o for o in options if getattr(o, "side", None) == "yes"), None)
    no_opt = next((o for o in options if getattr(o, "side", None) == "no"), None)
    if yes_opt and no_opt:
        return yes_opt, no_opt, False

    ordered = sorted(options, key=lambda o: (getattr(o, "option_index", 0), getattr(o, "id", 0)))
    if len(ordered) >= 2:
        return ordered[0], ordered[1], True
    return None, None, True


def _create_event_with_markets(event_fields, markets_data, amm_params_list, payload, created_by):
    created_markets = []
    with transaction.atomic():
        event = Event.objects.create(**event_fields, created_by_id=created_by)

        now = timezone.now()

        # For exclusive, we want sum(YES across markets) == 10000
        exclusive_yes_splits = _split_bps(10000, len(markets_data)) if event.group_rule == "exclusive" else []

        for idx, market_data in enumerate(markets_data):
            market = Market.objects.create(
                event=event,
                title=market_data["title"],
                description=market_data["description"],
                trading_deadline=market_data["trading_deadline"],
                resolution_deadline=market_data["resolution_deadline"],
                category=market_data.get("category") or payload.get("category"),
                cover_url=market_data.get("cover_url") or payload.get("cover_url"),
                slug=market_data.get("slug"),
                status=market_data.get("status") or "draft",
                chain=market_data.get("chain") or payload.get("chain"),
                contract_address=market_data.get("contract_address"),
                onchain_market_id=market_data.get("onchain_market_id"),
                create_tx_hash=market_data.get("create_tx_hash"),
                is_hidden=market_data.get("is_hidden", False),
                sort_weight=market_data.get("sort_weight", idx),
                created_by_id=created_by,
                market_kind=market_data.get("market_kind") or "binary",
                assertion_text=market_data.get("assertion_text"),
                bucket_label=market_data.get("bucket_label"),
            )

            raw_options = market_data.get("options") or []
            parsed_options = binary_options_from_payload(raw_options)
            for opt in parsed_options:
                opt.market = market
            MarketOption.objects.bulk_create(parsed_options)

            # Refetch for guaranteed PKs / canonical ordering
            persisted_opts = list(
                MarketOption.objects.filter(market=market, is_active=True).order_by("option_index", "id")
            )

            # Init stats (display only) with strict sum-to-10000
            stats_rows = []

            if persisted_opts:
                if event.group_rule == "exclusive" and len(persisted_opts) >= 2:
                    yes_target = exclusive_yes_splits[idx] if idx < len(exclusive_yes_splits) else 0
                    no_target = 10000 - yes_target
                    yes_opt, no_opt, used_fallback = _pick_yes_no_options(persisted_opts)

                    if used_fallback:
                        logger.warning(
                            "exclusive init: market %s options missing side yes/no; assuming option_index 0=YES 1=NO",
                            market.id,
                        )

                    # If we still can't pick, fall back to equal split (should be rare)
                    if yes_opt is None or no_opt is None:
                        splits = _split_bps(10000, len(persisted_opts))
                        for opt, prob in zip(persisted_opts, splits):
                            stats_rows.append(
                                MarketOptionStats(
                                    option=opt,
                                    market=market,
                                    prob_bps=prob,
                                    volume_24h=0,
                                    volume_total=0,
                                    updated_at=now,
                                )
                            )
                    else:
                        for opt in persisted_opts:
                            if opt.id == yes_opt.id:
                                prob = yes_target
                            elif opt.id == no_opt.id:
                                prob = no_target
                            else:
                                prob = 0
                            stats_rows.append(
                                MarketOptionStats(
                                    option=opt,
                                    market=market,
                                    prob_bps=prob,
                                    volume_24h=0,
                                    volume_total=0,
                                    updated_at=now,
                                )
                            )
                else:
                    splits = _split_bps(10000, len(persisted_opts))
                    for opt, prob in zip(persisted_opts, splits):
                        stats_rows.append(
                            MarketOptionStats(
                                option=opt,
                                market=market,
                                prob_bps=prob,
                                volume_24h=0,
                                volume_total=0,
                                updated_at=now,
                            )
                        )

            if stats_rows:
                MarketOptionStats.objects.bulk_create(stats_rows)

            created_markets.append(market)

        # Create AMM pools
        if event.group_rule == "exclusive":
            # In exclusive mode, params must be consistent; using "first" silently is dangerous
            base = amm_params_list[0] if amm_params_list else normalize_amm_params()
            for p in (amm_params_list or []):
                if (
                    p.get("model") != base.get("model")
                    or p.get("b") != base.get("b")
                    or p.get("fee_bps") != base.get("fee_bps")
                    or p.get("collateral_token") != base.get("collateral_token")
                ):
                    raise AmmSetupError("exclusive event requires identical amm params across markets")

            ensure_pool_initialized(event=event, amm_params=base, created_by_id=created_by)
        else:
            # standalone / independent => market-level pools
            for i, m in enumerate(created_markets):
                if amm_params_list and i < len(amm_params_list):
                    p = amm_params_list[i]
                else:
                    p = normalize_amm_params()
                ensure_pool_initialized(market=m, amm_params=p, created_by_id=created_by)

        if created_markets:
            event.primary_market = created_markets[0]
            event.save(update_fields=["primary_market", "updated_at"])

    return event


@require_http_methods(["GET"])
def list_events(request):
    """
    Lightweight listing for homepage cards (events with primary market snapshot).
    Supports ?category=xxx filter and ?lang=xx for translations.
    """
    is_admin = False
    user = get_user_from_request(request)
    if user and user.role == "admin":
        is_admin = True

    category = request.GET.get("category")
    ids_param = request.GET.get("ids")
    lang = request.GET.get("lang", "en")

    # Try cache first (skip for admin to always show fresh data, skip for non-en to avoid caching translated content)
    if not is_admin and lang == "en":
        cached = get_cached_event_list(category, is_admin, ids_param)
        if cached is not None:
            return JsonResponse(cached, status=200)

    # Use select_related for stats (OneToOne) instead of prefetch_related to avoid N+1
    options_qs = MarketOption.objects.select_related("stats").order_by("option_index")

    markets_qs = Market.objects.order_by("sort_weight", "-created_at").prefetch_related(
        Prefetch("options", queryset=options_qs, to_attr="prefetched_options")
    )
    if not is_admin:
        markets_qs = markets_qs.filter(status="active", is_hidden=False)

    # Always prefetch ALL translations for instant language switching
    translations_qs = EventTranslation.objects.all()

    events_qs = Event.objects.order_by("-sort_weight", "-created_at").prefetch_related(
        Prefetch("markets", queryset=markets_qs, to_attr="prefetched_markets"),
        Prefetch("translations", queryset=translations_qs, to_attr="prefetched_translations")
    )
    if not is_admin and not request.GET.get("all"):
        events_qs = events_qs.filter(status="active", is_hidden=False)

    # Category filter
    if category:
        events_qs = events_qs.filter(category__iexact=category)

    # IDs filter (for watchlist)
    if ids_param:
        id_list = [i.strip() for i in ids_param.split(",") if i.strip()]
        events_qs = events_qs.filter(id__in=id_list)

    items = [serialize_event(e, lang, include_all_translations=True) for e in events_qs[:100]]
    result = {"items": items}

    # Cache the result (only for non-admin and English)
    if not is_admin and lang == "en":
        set_cached_event_list(category, is_admin, result, ids_param)

    return JsonResponse(result, status=200)


@require_http_methods(["GET"])
def get_event(request, event_id):
    lang = request.GET.get("lang", "en")

    # Try cache first (only for English)
    if lang == "en":
        cached = get_cached_event_detail(str(event_id))
        if cached is not None:
            # Still need to check permissions for hidden events
            if cached.get("status") != "active" or cached.get("is_hidden"):
                user = get_user_from_request(request)
                if not (user and user.role == "admin"):
                    return JsonResponse({"error": "Event not available"}, status=404)
            return JsonResponse(cached, status=200)

    try:
        event = _prefetched_event(event_id)
    except Event.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)

    if event.status != "active" or event.is_hidden:
        user = get_user_from_request(request)
        if not (user and user.role == "admin"):
            return JsonResponse({"error": "Event not available"}, status=404)

    result = serialize_event(event, lang, include_all_translations=True)
    # Cache the result (only for English)
    if lang == "en":
        set_cached_event_detail(str(event_id), result)
    return JsonResponse(result, status=200)


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

    if not trading_deadline:
        return JsonResponse({"error": "trading_deadline is required"}, status=400)

    try:
        markets_data, event_group_rule = _normalize_markets_payload(
            payload, title, description, trading_deadline, resolution_deadline
        )
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    amm_defaults = payload.get("amm") or {}
    amm_params_list = []
    try:
        for market_data in markets_data:
            amm_params_list.append(normalize_amm_params(market_data.get("amm"), defaults=amm_defaults))
    except AmmSetupError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

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

    event = _create_event_with_markets(event_fields, markets_data, amm_params_list, payload, created_by)

    # Auto-translate event title and description to all supported languages
    try:
        from ..services.translation import translate_event
        translate_event(event)
    except Exception as e:
        logger.warning("Failed to auto-translate event %s: %s", event.id, e)

    event = _prefetched_event(event.id)
    event_data = serialize_event(event)
    _index_event_async(event_data)
    return JsonResponse(event_data, status=201)


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
        return JsonResponse({"error": f"Cannot publish event in status '{event.status}'"}, status=400)

    now = timezone.now()
    with transaction.atomic():
        event.status = "active"
        event.updated_at = now
        event.save(update_fields=["status", "updated_at"])
        Market.objects.filter(event=event).update(status="active", updated_at=now)

    # Self-healing: ensure AMM pool exists even if create_event partially succeeded earlier
    if event.group_rule == "exclusive":
        ensure_pool_initialized(event=event, amm_params=normalize_amm_params())
    else:
        for market in Market.objects.filter(event=event):
            ensure_pool_initialized(market=market, amm_params=normalize_amm_params())

    event = _prefetched_event(event_id)
    event_data = serialize_event(event)
    # Index the published event
    _index_event_async(event_data)
    # Invalidate caches
    invalidate_on_event_change(str(event_id))
    return JsonResponse(event_data, status=200)


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
    event_data = serialize_event(event)
    # Only delete from search index when canceled (resolved events stay visible for 3 days)
    if new_status == "canceled":
        _delete_event_index_async(str(event_id))
    else:
        # Index the updated event
        _index_event_async(event_data)
    return JsonResponse(event_data, status=200)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_event(request, event_id):
    """Update event fields (admin only)."""
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    admin_error = require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])

    payload, error = _decode_payload(request)
    if error:
        return error

    try:
        event = Event.objects.get(pk=event_id)
    except Event.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)

    # Updatable fields
    if "title" in payload:
        event.title = payload["title"]
    if "description" in payload:
        event.description = payload["description"]
    if "cover_url" in payload:
        event.cover_url = payload["cover_url"]
    if "category" in payload:
        event.category = payload["category"]
    if "slug" in payload:
        event.slug = payload["slug"]
    if "sort_weight" in payload:
        event.sort_weight = payload["sort_weight"]
    if "is_hidden" in payload:
        event.is_hidden = payload["is_hidden"]
    if "trading_deadline" in payload:
        event.trading_deadline = parse_iso_datetime(payload["trading_deadline"])
    if "resolution_deadline" in payload:
        event.resolution_deadline = parse_iso_datetime(payload["resolution_deadline"])

    event.updated_at = timezone.now()
    event.save()

    # Also update markets if needed
    markets_payload = payload.get("markets")
    if markets_payload:
        for m_data in markets_payload:
            m_id = m_data.get("id")
            if not m_id:
                continue
            try:
                market = Market.objects.get(pk=m_id, event=event)
                if "title" in m_data:
                    market.title = m_data["title"]
                if "description" in m_data:
                    market.description = m_data["description"]
                if "bucket_label" in m_data:
                    market.bucket_label = m_data["bucket_label"]
                if "sort_weight" in m_data:
                    market.sort_weight = m_data["sort_weight"]
                if "trading_deadline" in m_data:
                    market.trading_deadline = parse_iso_datetime(m_data["trading_deadline"])
                if "resolution_deadline" in m_data:
                    market.resolution_deadline = parse_iso_datetime(m_data["resolution_deadline"])
                market.updated_at = timezone.now()
                market.save()
            except Market.DoesNotExist:
                pass

    event = _prefetched_event(event_id)
    event_data = serialize_event(event)
    _index_event_async(event_data)
    # Invalidate caches
    invalidate_on_event_change(str(event_id))
    return JsonResponse(event_data, status=200)
