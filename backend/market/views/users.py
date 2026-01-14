import json
import logging
import os
import uuid as uuid_lib
from decimal import Decimal

import boto3
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import AmmPool, AmmPoolOptionState, BalanceSnapshot, Market, MarketOption, MarketOptionStats, OrderIntent, Position, User
from ..services.auth import get_user_from_request
from ..services.amm.quote_core import quote_from_state
from ..services.amm.state import PoolState
from ..services.amm.errors import QuoteError
from ..services.amm.money import _fee_rate_from_bps
from ..services.cache import (
    get_cached_portfolio, set_cached_portfolio,
    get_cached_order_history, set_cached_order_history,
    get_cached_leaderboard, set_cached_leaderboard,
)

logger = logging.getLogger(__name__)


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
        # Only update fields that are empty in the database
        # This preserves user-modified values (from profile page)
        update_fields = ["updated_at"]
        if not user.display_name and defaults["display_name"]:
            user.display_name = defaults["display_name"]
            update_fields.append("display_name")
        if not user.avatar_url and defaults["avatar_url"]:
            user.avatar_url = defaults["avatar_url"]
            update_fields.append("avatar_url")
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
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    return JsonResponse(
        {
            "id": str(user.id),
            "role": user.role,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "email": user.email,
            "onboarding_completed": user.onboarding_completed,
        },
        status=200,
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_profile(request):
    """Update user profile (display_name only, email is read-only)"""
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        payload = json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    display_name = payload.get("display_name")
    if display_name is not None:
        # Check if display_name is already taken by another user
        existing = User.objects.filter(display_name=display_name).exclude(id=user.id).first()
        if existing:
            return JsonResponse({"error": "Display name already taken"}, status=400)
        user.display_name = display_name

    user.updated_at = timezone.now()
    user.save(update_fields=["display_name", "updated_at"])

    return JsonResponse(
        {
            "id": str(user.id),
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "email": user.email,
        },
        status=200,
    )


# R2 configuration for avatar uploads
R2_BUCKET = "monofuture"
R2_PUBLIC_URL = "https://pub-7dfbb630627b4bee8f52115986b10d6a.r2.dev"


def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("CLOUDFLARE_ENDPOINT_URL"),
        aws_access_key_id=os.environ.get("CLOUDFLARE_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("CLOUDFLARE_SECRET_ACCESS_KEY"),
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def upload_avatar(request):
    """Upload user avatar image"""
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    if "file" not in request.FILES:
        return JsonResponse({"error": "No file provided"}, status=400)

    file = request.FILES["file"]
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        return JsonResponse({"error": "Invalid file type"}, status=400)

    ext = file.name.split(".")[-1] if "." in file.name else "jpg"
    filename = f"avatars/{uuid_lib.uuid4()}.{ext}"

    try:
        client = get_r2_client()
        client.upload_fileobj(
            file,
            R2_BUCKET,
            filename,
            ExtraArgs={"ContentType": file.content_type}
        )
        url = f"{R2_PUBLIC_URL}/{filename}"

        # Update user's avatar_url
        user.avatar_url = url
        user.updated_at = timezone.now()
        user.save(update_fields=["avatar_url", "updated_at"])

        return JsonResponse({"url": url}, status=200)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@require_http_methods(["GET", "OPTIONS"])
def get_balance(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    token = request.GET.get("token") or "USDC"
    balance = BalanceSnapshot.objects.filter(user=user, token=token).first()
    available = balance.available_amount if balance else Decimal(0)
    locked = balance.locked_amount if balance else Decimal(0)

    return JsonResponse(
        {
            "token": token,
            "available_amount": str(available),
            "locked_amount": str(locked),
        },
        status=200,
    )


def _get_cash_out_value(market_id, option_id, shares) -> Decimal:
    """计算卖出持仓能拿回的净金额（扣除手续费后）"""
    from ..services.amm.quote_loader import load_pool_state
    try:
        state = load_pool_state(market_id)
        target_idx, is_no_side = state.resolve_with_side(option_id=str(option_id), option_index=None)
        quote = quote_from_state(
            state,
            option_id=str(option_id),
            side="sell",
            shares=shares,
            is_no_side=is_no_side,
        )
        return Decimal(quote["amount_out"])
    except (QuoteError, Exception):
        return Decimal(0)


def _batch_load_pool_states(positions):
    """批量加载所有需要的 pool states，返回 {market_id: PoolState} 映射

    优化：最少 2 次数据库查询完成所有加载
    """
    import math
    from collections import defaultdict
    from django.db.models import Q

    if not positions:
        return {}

    pool_states = {}
    market_ids = list(set(str(pos.market_id) for pos in positions))

    # 从 positions 中提取 market -> event 映射（已经 select_related 了，无需查询）
    market_to_event = {}
    event_group_rules = {}
    for pos in positions:
        if pos.market and pos.market.event_id:
            mid = str(pos.market_id)
            eid = str(pos.market.event_id)
            market_to_event[mid] = eid
            if pos.market.event:
                event_group_rules[eid] = pos.market.event.group_rule

    event_ids = list(set(market_to_event.values()))

    # 查询 1: 批量获取所有 pools + option states（使用 prefetch）
    all_pools = list(
        AmmPool.objects.filter(Q(market_id__in=market_ids) | Q(event_id__in=event_ids))
        .prefetch_related('option_states__option')
    )

    market_pools = {str(p.market_id): p for p in all_pools if p.market_id}
    event_pools = {str(p.event_id): p for p in all_pools if p.event_id}

    # 确定每个 market 使用哪个 pool
    market_to_pool = {}
    for mid in market_ids:
        if mid in market_pools:
            market_to_pool[mid] = market_pools[mid]
        elif mid in market_to_event:
            eid = market_to_event[mid]
            if eid in event_pools:
                market_to_pool[mid] = event_pools[eid]

    if not market_to_pool:
        return {}

    # 按 pool_id 分组 option states（从 prefetch 中获取）
    pool_option_states = defaultdict(list)
    for pool in all_pools:
        pid = str(pool.id)
        states = list(pool.option_states.all())
        states.sort(key=lambda s: (s.option.option_index, s.option_id))
        pool_option_states[pid] = states

    # 查询 2: 批量加载 No 选项映射（仅 exclusive events 需要）
    exclusive_event_ids = [eid for eid, rule in event_group_rules.items() if (rule or '').strip().lower() == 'exclusive']
    no_option_mapping = {}
    if exclusive_event_ids:
        yes_opt_ids = []
        for states in pool_option_states.values():
            yes_opt_ids.extend(int(s.option_id) for s in states)

        if yes_opt_ids:
            yes_opts = list(MarketOption.objects.filter(id__in=yes_opt_ids).values_list('id', 'market_id'))
            yes_market_ids = [m_id for _, m_id in yes_opts]
            yes_opt_by_market = {m_id: opt_id for opt_id, m_id in yes_opts}

            no_opts = list(MarketOption.objects.filter(
                market_id__in=yes_market_ids, side='no', is_active=True
            ).values_list('id', 'market_id'))

            for no_opt_id, m_id in no_opts:
                yes_opt_id = yes_opt_by_market.get(m_id)
                if yes_opt_id:
                    no_option_mapping[str(no_opt_id)] = str(yes_opt_id)

    # 构建 PoolState 对象（纯内存操作）
    for mid_str, pool in market_to_pool.items():
        pid = str(pool.id)
        states = pool_option_states.get(pid, [])
        if not states:
            continue

        b = float(pool.b)
        if not (math.isfinite(b) and b > 0.0):
            continue

        option_ids = [str(s.option.id) for s in states]
        option_indexes = [int(s.option.option_index) for s in states]
        q = [float(s.q) for s in states]

        option_id_to_idx = {oid: i for i, oid in enumerate(option_ids)}
        option_index_to_idx = {oi: i for i, oi in enumerate(option_indexes)}

        eid = market_to_event.get(mid_str)
        is_exclusive = eid and (event_group_rules.get(eid, '') or '').strip().lower() == 'exclusive'

        no_to_yes = {}
        if is_exclusive:
            for no_id, yes_id in no_option_mapping.items():
                if yes_id in option_id_to_idx:
                    no_to_yes[no_id] = (yes_id, option_id_to_idx[yes_id])

        pool_states[mid_str] = PoolState(
            market_id=mid_str,
            pool_id=pid,
            b=b,
            fee_bps=int(pool.fee_bps or 0),
            option_ids=option_ids,
            option_indexes=option_indexes,
            q=q,
            option_id_to_idx=option_id_to_idx,
            option_index_to_idx=option_index_to_idx,
            no_to_yes_option_id=no_to_yes,
            is_exclusive=is_exclusive,
        )

    return pool_states


@require_http_methods(["GET", "OPTIONS"])
def portfolio(request):
    """获取用户 portfolio，支持 ?include_pnl=false 跳过 PnL 计算以加速加载"""
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    token = request.GET.get("token") or "USDC"
    include_pnl = request.GET.get("include_pnl", "true").lower() != "false"

    # Try cache first
    cached = get_cached_portfolio(str(user.id), token, include_pnl)
    if cached is not None:
        return JsonResponse(cached, status=200)

    balance = BalanceSnapshot.objects.filter(user=user, token=token).first()
    available = balance.available_amount if balance else Decimal(0)

    # Active positions (excluding resolved/canceled markets)
    positions = list(
        Position.objects.select_related("market", "market__event", "option", "option__stats")
        .filter(user=user, shares__gt=0)
        .exclude(market__status__in=["resolved", "canceled"])
        .order_by("-updated_at")
    )

    # Settled positions (resolved markets) for realized P&L
    settled_positions = list(
        Position.objects.select_related("market", "option")
        .filter(user=user, market__status="resolved")
    ) if include_pnl else []

    # Calculate realized P&L from settled markets
    realized_pnl = Decimal(0)
    for sp in settled_positions:
        winning_idx = sp.market.resolved_option_index
        if winning_idx is not None and sp.option.option_index == winning_idx:
            # User held winning option: payout = shares * 1
            payout = sp.shares
        else:
            # User held losing option: payout = 0
            payout = Decimal(0)
        realized_pnl += payout - sp.cost_basis

    # 只在需要时加载 pool states
    pool_states = _batch_load_pool_states(positions) if include_pnl else {}

    items = []
    total_value = Decimal(0)
    total_cash_out = Decimal(0)
    total_cost_basis = Decimal(0)

    for pos in positions:
        stats = getattr(pos.option, "stats", None)
        prob_bps = stats.prob_bps if stats else None
        price = Decimal(prob_bps) / Decimal(10000) if prob_bps is not None else None
        value = price * pos.shares if price is not None else Decimal(0)
        total_value += value

        cash_out_value = None
        pnl = None
        mid_str = str(pos.market_id)

        if include_pnl and mid_str in pool_states:
            try:
                state = pool_states[mid_str]
                target_idx, is_no_side = state.resolve_with_side(option_id=str(pos.option_id), option_index=None)
                quote = quote_from_state(
                    state,
                    option_id=str(pos.option_id),
                    side="sell",
                    shares=pos.shares,
                    is_no_side=is_no_side,
                )
                cash_out_value = Decimal(quote["amount_out"])
                pnl = cash_out_value - pos.cost_basis
                total_cash_out += cash_out_value
            except (QuoteError, Exception):
                cash_out_value = Decimal(0)
                pnl = Decimal(0) - pos.cost_basis

        total_cost_basis += pos.cost_basis

        item = {
            "market_id": mid_str,
            "event_id": str(pos.market.event_id) if pos.market and pos.market.event_id else None,
            "market_title": pos.market.title,
            "event_title": pos.market.event.title if pos.market and pos.market.event else None,
            "option_id": pos.option_id,
            "option_title": pos.option.title,
            "probability_bps": prob_bps,
            "price": str(price) if price is not None else None,
            "shares": str(pos.shares),
            "cost_basis": str(pos.cost_basis),
            "value": str(value),
            "updated_at": pos.updated_at.isoformat() if pos.updated_at else None,
        }
        if include_pnl:
            item["cash_out_value"] = str(cash_out_value) if cash_out_value is not None else None
            item["pnl"] = str(pnl) if pnl is not None else None
        items.append(item)

    result = {
        "balance": {
            "token": token,
            "available_amount": str(available),
        },
        "positions": items,
        "portfolio_value": str(total_value),
    }
    if include_pnl:
        unrealized_pnl = total_cash_out - total_cost_basis
        total_pnl = unrealized_pnl + realized_pnl
        result["total_cash_out_value"] = str(total_cash_out)
        result["unrealized_pnl"] = str(unrealized_pnl)
        result["realized_pnl"] = str(realized_pnl)
        result["total_pnl"] = str(total_pnl)

    # Cache the result
    set_cached_portfolio(str(user.id), token, include_pnl, result)

    return JsonResponse(result, status=200)


@require_http_methods(["GET", "OPTIONS"])
def order_history(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        page = max(int(request.GET.get("page", 1)), 1)
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.GET.get("page_size", 10))
    except (TypeError, ValueError):
        page_size = 10
    page_size = max(1, min(page_size, 100))

    # Try cache first
    cached = get_cached_order_history(str(user.id), page, page_size)
    if cached is not None:
        return JsonResponse(cached, status=200)

    # Count totals first (fast)
    intent_count = OrderIntent.objects.filter(user=user).count()
    settled_count = Position.objects.filter(user=user, market__status="resolved").count()
    total = intent_count + settled_count
    offset = (page - 1) * page_size

    # Optimize: only fetch what we need based on offset
    all_items = []

    # If offset is within intents range, fetch intents
    if offset < intent_count:
        intents_needed = min(page_size, intent_count - offset)
        intents = list(
            OrderIntent.objects.select_related("market", "market__event", "option", "option__stats")
            .filter(user=user)
            .order_by("-created_at")[offset:offset + intents_needed]
        )
        for intent in intents:
            stats = getattr(intent.option, "stats", None) if intent.option else None
            prob_bps = stats.prob_bps if stats else None
            price = Decimal(prob_bps) / Decimal(10000) if prob_bps is not None else None
            event_title = intent.market.event.title if intent.market and intent.market.event else None
            all_items.append({
                "id": f"order_{intent.id}",
                "market_id": str(intent.market_id),
                "event_id": str(intent.market.event_id) if intent.market and intent.market.event_id else None,
                "market_title": intent.market.title if intent.market else None,
                "event_title": event_title,
                "option_id": intent.option_id,
                "option_title": intent.option.title if intent.option else None,
                "side": intent.side,
                "amount_in": str(intent.amount_in) if intent.amount_in is not None else None,
                "shares_out": str(intent.shares_out) if intent.shares_out is not None else None,
                "status": intent.status,
                "probability_bps": prob_bps,
                "price": str(price) if price is not None else None,
                "created_at": intent.created_at.isoformat() if intent.created_at else None,
            })

    # If we need more items from settled positions
    remaining = page_size - len(all_items)
    if remaining > 0:
        settled_offset = max(0, offset - intent_count)
        settled_positions = list(
            Position.objects.select_related("market", "market__event", "option")
            .filter(user=user, market__status="resolved")
            .order_by("-market__resolved_at")[settled_offset:settled_offset + remaining]
        )
        for sp in settled_positions:
            winning_idx = sp.market.resolved_option_index
            is_winner = winning_idx is not None and sp.option.option_index == winning_idx
            payout = sp.shares if is_winner else Decimal(0)
            side = "claimed" if is_winner else "lost"
            event_title = sp.market.event.title if sp.market and sp.market.event else None
            resolved_at = sp.market.resolved_at or sp.market.updated_at
            all_items.append({
                "id": f"settle_{sp.id}",
                "market_id": str(sp.market_id),
                "event_id": str(sp.market.event_id) if sp.market and sp.market.event_id else None,
                "market_title": sp.market.title if sp.market else None,
                "event_title": event_title,
                "option_id": sp.option_id,
                "option_title": sp.option.title if sp.option else None,
                "side": side,
                "amount_in": str(payout),
                "shares_out": str(sp.shares),
                "cost_basis": str(sp.cost_basis),
                "status": "resolved",
                "probability_bps": 10000 if is_winner else 0,
                "price": "1" if is_winner else "0",
                "created_at": resolved_at.isoformat() if resolved_at else None,
            })

    result = {"items": all_items, "page": page, "page_size": page_size, "total": total}
    # Cache the result
    set_cached_order_history(str(user.id), page, page_size, result)

    return JsonResponse(result, status=200)


@require_http_methods(["GET", "OPTIONS"])
def pnl_history(request):
    """获取用户收益历史数据，用于绘制收益曲线

    PnL 定义：
    - PnL = 当前持仓市值 - 持仓成本 + 已结算净收益
    - 买入/卖出不改变 PnL（只是资产形态转换）
    - 只有市场价格变化或结算才会改变 PnL

    已实现收益：只有市场结算时才产生（payout - cost_basis）
    未实现收益：当前持仓市值 - 持仓成本
    """
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    from datetime import timedelta
    from collections import defaultdict
    from ..models import Position
    from django.db.models import Q

    period = request.GET.get("period", "1m")
    now = timezone.now()

    if period == "1d":
        start_date = now - timedelta(days=1)
    elif period == "1w":
        start_date = now - timedelta(weeks=1)
    elif period == "1m":
        start_date = now - timedelta(days=30)
    else:  # all
        start_date = None

    # 已实现收益：只计算已结算市场的 payout - cost_basis
    # 买入/卖出不产生 realized PnL，只有结算才产生
    daily_realized_pnl = defaultdict(lambda: Decimal(0))

    settled_positions = Position.objects.filter(
        Q(shares__gt=0) | Q(cost_basis__gt=0),
        user=user, market__status="resolved"
    ).select_related("market", "option").only(
        "shares", "cost_basis", "market__resolved_option_index",
        "market__resolved_at", "market__updated_at", "option__option_index"
    )
    for sp in settled_positions:
        winning_idx = sp.market.resolved_option_index
        if winning_idx is not None and sp.option.option_index == winning_idx:
            payout = sp.shares
        else:
            payout = Decimal(0)
        settled_pnl = payout - sp.cost_basis
        settled_date = (sp.market.resolved_at or sp.market.updated_at or now).date().isoformat()
        daily_realized_pnl[settled_date] += settled_pnl

    # 未实现收益：当前持仓市值 - 持仓成本（只针对活跃市场）
    unrealized_pnl = Decimal(0)
    positions = Position.objects.filter(
        user=user, shares__gt=0
    ).select_related("option__stats").exclude(
        market__status__in=["resolved", "canceled"]
    ).only("shares", "cost_basis", "option__stats__prob_bps")
    for pos in positions:
        stats = getattr(pos.option, "stats", None) if pos.option else None
        if stats and stats.prob_bps is not None:
            price = Decimal(stats.prob_bps) / Decimal(10000)
            market_value = price * pos.shares
            unrealized_pnl += market_value - pos.cost_basis

    # 生成数据点（只有结算事件才会产生历史数据点）
    data_points = []
    cumulative_realized = Decimal(0)

    for date_key in sorted(daily_realized_pnl.keys()):
        cumulative_realized += daily_realized_pnl[date_key]
        if start_date is None or date_key >= start_date.date().isoformat():
            data_points.append({
                "date": date_key,
                "pnl": float(cumulative_realized),
            })

    # 总收益 = 已实现 + 未实现
    total_pnl = cumulative_realized + unrealized_pnl

    # 添加当前点（包含未实现收益）
    today = now.date().isoformat()
    if data_points and data_points[-1]["date"] == today:
        data_points[-1]["pnl"] = float(total_pnl)
    else:
        if start_date is None or today >= start_date.date().isoformat():
            data_points.append({"date": today, "pnl": float(total_pnl)})

    if not data_points:
        data_points.append({"date": today, "pnl": float(total_pnl)})

    return JsonResponse({
        "period": period,
        "current_pnl": float(total_pnl),
        "realized_pnl": float(cumulative_realized),
        "unrealized_pnl": float(unrealized_pnl),
        "data": data_points,
    }, status=200)


@require_http_methods(["GET", "OPTIONS"])
def leaderboard(request):
    """获取排行榜数据"""
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    from datetime import timedelta
    from collections import defaultdict
    from django.db.models import Sum, F
    from ..models import Trade, Position, Event

    # 参数
    period = request.GET.get("period", "all")  # today, weekly, monthly, all
    category = request.GET.get("category")  # event category filter
    search = request.GET.get("search", "").strip()
    sort_by = request.GET.get("sort", "pnl")  # pnl or volume
    limit = min(int(request.GET.get("limit", 50)), 100)

    # Try cache first (skip if search is provided as it's user-specific)
    if not search:
        cached = get_cached_leaderboard(period, category, sort_by, limit)
        if cached is not None:
            # Add current user data if authenticated
            current_user = get_user_from_request(request)
            if current_user:
                current_user_id = str(current_user.id)
                for item in cached.get("users", []):
                    if item["user_id"] == current_user_id:
                        cached["current_user"] = {**item, "is_current_user": True}
                        break
            return JsonResponse(cached, status=200)

    now = timezone.now()
    if period == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        start_date = now - timedelta(weeks=1)
    elif period == "monthly":
        start_date = now - timedelta(days=30)
    else:
        start_date = None

    # 获取所有用户的交易数据
    trades_filter = {}
    if start_date:
        trades_filter["block_time__gte"] = start_date
    if category:
        trades_filter["market__event__category"] = category

    # 计算每个用户的交易量
    volume_by_user = defaultdict(lambda: Decimal(0))
    trades = Trade.objects.filter(**trades_filter).values("user_id", "amount_in")
    for t in trades:
        if t["user_id"]:
            volume_by_user[str(t["user_id"])] += Decimal(str(t["amount_in"] or 0))

    # 计算每个用户的 PnL（已实现 + 未实现）
    # 已实现收益：只有市场结算时才产生（payout - cost_basis）
    # 买入/卖出不产生 realized PnL
    pnl_by_user = defaultdict(lambda: Decimal(0))

    # 获取所有有交易的用户
    user_ids = list(volume_by_user.keys())
    if not user_ids:
        return JsonResponse({"users": [], "current_user": None}, status=200)

    # 计算已实现收益：只来自已结算市场
    from django.db.models import Q
    position_filter = {"user_id__in": user_ids, "market__status": "resolved"}
    if category:
        position_filter["market__event__category"] = category
    if start_date:
        position_filter["market__resolved_at__gte"] = start_date

    settled_positions = Position.objects.filter(
        Q(shares__gt=0) | Q(cost_basis__gt=0),
        **position_filter
    ).select_related("market", "option")

    for sp in settled_positions:
        user_id = str(sp.user_id)
        winning_idx = sp.market.resolved_option_index
        if winning_idx is not None and sp.option.option_index == winning_idx:
            payout = Decimal(sp.shares)
        else:
            payout = Decimal(0)
        realized_pnl = payout - Decimal(sp.cost_basis)
        pnl_by_user[user_id] += realized_pnl

    # 计算未实现收益：当前持仓市值 - 持仓成本
    unrealized_filter = {"user_id__in": user_ids, "shares__gt": 0}
    if category:
        unrealized_filter["market__event__category"] = category
    positions = Position.objects.filter(**unrealized_filter).exclude(
        market__status__in=["resolved", "canceled"]
    ).select_related("option__stats")
    for pos in positions:
        user_id = str(pos.user_id)
        stats = getattr(pos.option, "stats", None) if pos.option else None
        if stats and stats.prob_bps is not None:
            price = Decimal(stats.prob_bps) / Decimal(10000)
            market_value = price * pos.shares
            unrealized = market_value - pos.cost_basis
            pnl_by_user[user_id] = pnl_by_user.get(user_id, Decimal(0)) + unrealized

    # 获取用户信息
    users = User.objects.filter(id__in=user_ids)
    if search:
        users = users.filter(display_name__icontains=search)
    user_info = {str(u.id): {"display_name": u.display_name, "avatar_url": u.avatar_url} for u in users}

    # 构建排行榜
    leaderboard_data = []
    for user_id in user_ids:
        if user_id not in user_info:
            continue
        leaderboard_data.append({
            "user_id": user_id,
            "display_name": user_info[user_id]["display_name"] or f"User_{user_id[:8]}",
            "avatar_url": user_info[user_id]["avatar_url"],
            "pnl": float(pnl_by_user.get(user_id, 0)),
            "volume": float(volume_by_user.get(user_id, 0)),
        })

    # 排序
    if sort_by == "volume":
        leaderboard_data.sort(key=lambda x: x["volume"], reverse=True)
    else:
        leaderboard_data.sort(key=lambda x: x["pnl"], reverse=True)

    # 添加排名
    for i, item in enumerate(leaderboard_data):
        item["rank"] = i + 1

    # 获取当前用户排名
    current_user = get_user_from_request(request)
    current_user_data = None
    if current_user:
        current_user_id = str(current_user.id)
        for item in leaderboard_data:
            if item["user_id"] == current_user_id:
                current_user_data = {**item, "is_current_user": True}
                break
        if not current_user_data and current_user_id in user_info:
            current_user_data = {
                "user_id": current_user_id,
                "display_name": user_info.get(current_user_id, {}).get("display_name") or current_user.display_name,
                "avatar_url": user_info.get(current_user_id, {}).get("avatar_url") or current_user.avatar_url,
                "pnl": float(pnl_by_user.get(current_user_id, 0)),
                "volume": float(volume_by_user.get(current_user_id, 0)),
                "rank": len(leaderboard_data) + 1,
                "is_current_user": True,
            }

    # 获取分类列表
    categories = list(Event.objects.exclude(category__isnull=True).exclude(category="").values_list("category", flat=True).distinct())

    result = {
        "users": leaderboard_data[:limit],
        "current_user": current_user_data,
        "categories": categories,
    }

    # Cache the result (only if no search filter)
    if not search:
        set_cached_leaderboard(period, category, sort_by, limit, result)

    return JsonResponse(result, status=200)


ONBOARDING_BONUS_AMOUNT = Decimal("1000")
ONBOARDING_BONUS_TOKEN = "USDC"


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def complete_onboarding(request):
    """Complete user onboarding: update display_name and grant 1000 bonus tokens."""
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    user = get_user_from_request(request)
    if not user:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    if user.onboarding_completed:
        return JsonResponse({"error": "Onboarding already completed"}, status=400)

    try:
        payload = json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    display_name = payload.get("display_name", "").strip()
    if display_name:
        existing = User.objects.filter(display_name=display_name).exclude(id=user.id).first()
        if existing:
            return JsonResponse({"error": "Display name already taken"}, status=400)
        user.display_name = display_name

    from django.db import transaction
    with transaction.atomic():
        # Mark onboarding as completed
        user.onboarding_completed = True
        user.updated_at = timezone.now()
        user.save(update_fields=["display_name", "onboarding_completed", "updated_at"])

        # Grant bonus tokens
        balance, _ = BalanceSnapshot.objects.get_or_create(
            user=user,
            token=ONBOARDING_BONUS_TOKEN,
            defaults={"available_amount": Decimal(0), "locked_amount": Decimal(0)},
        )
        balance.available_amount += ONBOARDING_BONUS_AMOUNT
        balance.updated_at = timezone.now()
        balance.save()

    return JsonResponse({
        "success": True,
        "display_name": user.display_name,
        "bonus_amount": str(ONBOARDING_BONUS_AMOUNT),
        "bonus_token": ONBOARDING_BONUS_TOKEN,
        "new_balance": str(balance.available_amount),
    }, status=200)

