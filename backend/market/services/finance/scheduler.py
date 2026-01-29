import asyncio
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Tuple

from asgiref.sync import sync_to_async
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from zoneinfo import ZoneInfo

from ...models import (
    AmmPool,
    Event,
    FinanceMarketWindow,
    Market,
    MarketOption,
    MarketOptionStats,
    Position,
)
from ..amm.setup import ensure_pool_initialized, normalize_amm_params
from ..amm.settlement import resolve_and_settle_market
from ..cache import invalidate_event_list, invalidate_event_detail
from .constants import FINANCE_ASSETS, FINANCE_INTERVALS
from .price_store import PriceStore

logger = logging.getLogger(__name__)

ET_TZ = ZoneInfo("America/New_York")
UTC_TZ = ZoneInfo("UTC")
_CALENDAR = None


def _floor_time(dt: datetime, minutes: int) -> datetime:
    epoch = int(dt.timestamp())
    interval = minutes * 60
    floored = epoch - (epoch % interval)
    return datetime.fromtimestamp(floored, tz=UTC_TZ)


def _crypto_window(now: datetime, interval_key: str) -> Tuple[datetime, datetime]:
    if interval_key == "1d":
        start = now.astimezone(UTC_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        return start, end
    if interval_key == "1w":
        utc_now = now.astimezone(UTC_TZ)
        start = (utc_now - timedelta(days=utc_now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end = start + timedelta(days=7)
        return start, end

    minutes = FINANCE_INTERVALS[interval_key]["minutes"]
    start = _floor_time(now.astimezone(UTC_TZ), minutes)
    end = start + timedelta(minutes=minutes)
    return start, end


def _get_us_market_calendar():
    global _CALENDAR
    if _CALENDAR is not None:
        return _CALENDAR
    try:
        import pandas_market_calendars as mcal
    except Exception as exc:
        logger.warning("pandas_market_calendars not available: %s", exc)
        return None
    _CALENDAR = mcal.get_calendar("XNYS")
    return _CALENDAR


def _session_bounds(now: datetime) -> Optional[Tuple[datetime, datetime]]:
    cal = _get_us_market_calendar()
    local_now = now.astimezone(ET_TZ)
    if not cal:
        if local_now.weekday() >= 5:
            return None
        session_open = local_now.replace(hour=9, minute=30, second=0, microsecond=0)
        session_close = local_now.replace(hour=16, minute=0, second=0, microsecond=0)
        return session_open.astimezone(UTC_TZ), session_close.astimezone(UTC_TZ)

    schedule = cal.schedule(start_date=local_now.date(), end_date=local_now.date())
    if schedule.empty:
        return None
    open_time = schedule.iloc[0]["market_open"].to_pydatetime()
    close_time = schedule.iloc[0]["market_close"].to_pydatetime()
    return open_time.astimezone(UTC_TZ), close_time.astimezone(UTC_TZ)


def _weekly_bounds(now: datetime) -> Optional[Tuple[datetime, datetime]]:
    cal = _get_us_market_calendar()
    local_now = now.astimezone(ET_TZ)
    week_start = (local_now - timedelta(days=local_now.weekday())).date()
    week_end = week_start + timedelta(days=6)
    if not cal:
        if local_now.weekday() >= 5:
            return None
        open_time = datetime.combine(week_start, datetime.min.time(), tzinfo=ET_TZ).replace(
            hour=9, minute=30
        )
        close_time = datetime.combine(week_start + timedelta(days=4), datetime.min.time(), tzinfo=ET_TZ).replace(
            hour=16, minute=0
        )
        return open_time.astimezone(UTC_TZ), close_time.astimezone(UTC_TZ)

    schedule = cal.schedule(start_date=week_start, end_date=week_end)
    if schedule.empty:
        return None
    open_time = schedule.iloc[0]["market_open"].to_pydatetime()
    close_time = schedule.iloc[-1]["market_close"].to_pydatetime()
    return open_time.astimezone(UTC_TZ), close_time.astimezone(UTC_TZ)


def _stock_window(now: datetime, interval_key: str) -> Optional[Tuple[datetime, datetime]]:
    bounds = _session_bounds(now)
    if not bounds:
        return None
    session_open, session_close = bounds
    if interval_key == "1d":
        return session_open, session_close
    if interval_key == "1w":
        return _weekly_bounds(now)

    if not (session_open <= now <= session_close):
        return None
    minutes = FINANCE_INTERVALS[interval_key]["minutes"]
    elapsed = int((now - session_open).total_seconds() // 60)
    bucket = elapsed // minutes
    start = session_open + timedelta(minutes=bucket * minutes)
    end = start + timedelta(minutes=minutes)
    if end > session_close:
        return None
    return start, end


def _build_title(asset_name: str, interval_key: str) -> str:
    suffix = FINANCE_INTERVALS[interval_key]["title_suffix"]
    return f"Will {asset_name} go Up {suffix}?"


def _build_description(asset_symbol: str, window_start: datetime, window_end: datetime) -> str:
    return (
        f"Prediction window for {asset_symbol}: "
        f"{window_start.isoformat()} to {window_end.isoformat()} (UTC)."
    )


def _build_search_doc(
    *,
    event: Event,
    market: Optional[Market],
    outcomes: list,
    volume_total: float = 0,
) -> dict:
    return {
        "id": str(event.id),
        "title": event.title,
        "description": event.description or "",
        "category": event.category or "",
        "status": event.status,
        "cover_url": event.cover_url,
        "created_at": event.created_at.timestamp() if event.created_at else 0,
        "trading_deadline": event.trading_deadline.timestamp() if event.trading_deadline else 0,
        "volume_total": volume_total,
        "market_id": str(market.id) if market else None,
        "outcomes": outcomes,
    }


def _index_finance_event_doc(doc: dict) -> None:
    try:
        from ..search import index_event
        index_event(doc)
    except Exception as exc:
        logger.warning("Failed to index finance event %s: %s", doc.get("id"), exc)


@sync_to_async
def _delete_event_from_search(event_id: str) -> None:
    try:
        from ..search import delete_event
        delete_event(event_id)
    except Exception as exc:
        logger.warning("Failed to delete finance event %s from search: %s", event_id, exc)


@sync_to_async
def _create_finance_event_market(
    *,
    asset_symbol: str,
    interval_key: str,
    window_start: datetime,
    window_end: datetime,
    prev_close_price: Optional[Decimal],
    source: str,
    asset_name: str,
    asset_type: str,
) -> Optional[FinanceMarketWindow]:
    existing = (
        FinanceMarketWindow.objects.select_related("event", "market")
        .filter(
            asset_symbol=asset_symbol,
            interval=interval_key,
            window_start=window_start,
        )
        .first()
    )
    if existing:
        event = existing.event
        market = existing.market
        now = timezone.now()
        if (
            event
            and market
            and not event.is_hidden
            and event.status == "active"
            and market.status == "active"
            and existing.window_end > now
        ):
            stats = list(MarketOptionStats.objects.filter(market_id=market.id))
            options = list(MarketOption.objects.filter(market_id=market.id))
            volume_total = sum(float(s.volume_total or 0) for s in stats)
            outcomes = []
            for opt in options:
                stat = next((s for s in stats if s.option_id == opt.id), None)
                outcomes.append({
                    "id": opt.id,
                    "name": opt.title,
                    "probability_bps": stat.prob_bps if stat else 0,
                })

            search_doc = _build_search_doc(
                event=event,
                market=market,
                outcomes=outcomes,
                volume_total=volume_total,
            )
            _index_finance_event_doc(search_doc)
        else:
            if event:
                try:
                    from ..search import delete_event
                    delete_event(str(event.id))
                except Exception as exc:
                    logger.warning("Failed to delete stale finance event %s: %s", event.id, exc)
        return existing

    title = _build_title(asset_name, interval_key)
    description = _build_description(asset_symbol, window_start, window_end)
    image_url = FINANCE_ASSETS.get(asset_symbol, {}).get("image_url")
    event = None

    with transaction.atomic():
        event = Event.objects.create(
            title=title,
            description=description,
            category="finance",
            status="active",
            group_rule="standalone",
            trading_deadline=window_end,
            resolution_deadline=window_end,
            sort_weight=-100,
            cover_url=image_url,
        )
        market = Market.objects.create(
            event=event,
            title=title,
            description=description,
            category="finance",
            status="active",
            trading_deadline=window_end,
            resolution_deadline=window_end,
            market_kind="binary",
            bucket_label=FINANCE_INTERVALS[interval_key]["label"],
            cover_url=image_url,
        )

        options = [
            MarketOption(market=market, option_index=0, title="NO", side="no", is_active=True),
            MarketOption(market=market, option_index=1, title="YES", side="yes", is_active=True),
        ]
        MarketOption.objects.bulk_create(options)

        created_options = list(
            MarketOption.objects.filter(market=market).order_by("option_index")
        )

        now = timezone.now()
        stats = [
            MarketOptionStats(
                option=created_options[0],
                market=market,
                prob_bps=5000,
                volume_24h=0,
                volume_total=0,
                updated_at=now,
            ),
            MarketOptionStats(
                option=created_options[1],
                market=market,
                prob_bps=5000,
                volume_24h=0,
                volume_total=0,
                updated_at=now,
            ),
        ]
        MarketOptionStats.objects.bulk_create(stats)

        ensure_pool_initialized(market=market, amm_params=normalize_amm_params(), created_by_id=None)

        event.primary_market = market
        event.save(update_fields=["primary_market", "updated_at"])

        window = FinanceMarketWindow.objects.create(
            event=event,
            market=market,
            asset_symbol=asset_symbol,
            asset_name=asset_name,
            asset_type=asset_type,
            interval=interval_key,
            window_start=window_start,
            window_end=window_end,
            prev_close_price=prev_close_price,
            price_precision=2,
            source=source,
            created_at=now,
            updated_at=now,
        )

        prob_by_option_id = {stat.option_id: stat.prob_bps for stat in stats}
        outcomes = [
            {
                "id": opt.id,
                "name": opt.title,
                "probability_bps": prob_by_option_id.get(opt.id, 0),
            }
            for opt in created_options
        ]
        search_doc = _build_search_doc(event=event, market=market, outcomes=outcomes, volume_total=0)
        transaction.on_commit(lambda: _index_finance_event_doc(search_doc))

    try:
        from ..translation import translate_event
        translate_event(event)
    except Exception as exc:
        logger.warning("Failed to auto-translate finance event %s: %s", event.id, exc)

    invalidate_event_list()
    return window


@sync_to_async
def _settle_window(window_id: int, close_price: Decimal) -> None:
    window = FinanceMarketWindow.objects.select_related("market").get(id=window_id)
    if window.close_price is not None:
        return
    market = window.market
    if market.status in {"resolved", "canceled"}:
        return

    prev_price = window.prev_close_price or close_price
    winning_option_index = 1 if close_price >= prev_price else 0

    _ensure_finance_settlement_funding(market.id, winning_option_index)
    resolve_and_settle_market(market_id=str(market.id), winning_option_index=winning_option_index)

    window.close_price = close_price
    window.updated_at = timezone.now()
    window.save(update_fields=["close_price", "updated_at"])
    invalidate_event_detail(str(window.event_id))
    try:
        from ..search import delete_event
        delete_event(str(window.event_id))
    except Exception as exc:
        logger.warning("Failed to delete settled finance event %s from search: %s", window.event_id, exc)


def _ensure_finance_settlement_funding(market_id, winning_option_index: int) -> None:
    with transaction.atomic():
        market = Market.objects.select_for_update().get(pk=market_id)
        winning_option = MarketOption.objects.get(market=market, option_index=winning_option_index)
        total_winning_shares = (
            Position.objects.filter(market=market, option=winning_option, shares__gt=0).aggregate(
                total=Sum("shares")
            )["total"]
            or Decimal("0")
        )
        pool = AmmPool.objects.select_for_update().get(market=market)
        pool_cash = Decimal(pool.pool_cash)
        collateral_amount = Decimal(pool.collateral_amount)
        shortfall = total_winning_shares - pool_cash - collateral_amount
        if shortfall > 0:
            pool.collateral_amount = collateral_amount + shortfall
            pool.updated_at = timezone.now()
            pool.save(update_fields=["collateral_amount", "updated_at"])
            logger.info(
                "Auto-funded finance settlement: market_id=%s, shortfall=%s, new_collateral=%s",
                market_id,
                shortfall,
                pool.collateral_amount,
            )


@sync_to_async
def _get_previous_close(asset_symbol: str, interval_key: str, window_start: datetime) -> Optional[Decimal]:
    prev = (
        FinanceMarketWindow.objects.filter(
            asset_symbol=asset_symbol,
            interval=interval_key,
            window_end__lt=window_start,
        )
        .exclude(close_price__isnull=True)
        .order_by("-window_end")
        .first()
    )
    return prev.close_price if prev else None


@sync_to_async
def _due_windows(now: datetime):
    return list(
        FinanceMarketWindow.objects.select_related("market")
        .filter(window_end__lte=now, close_price__isnull=True)
        .exclude(market__status__in=["resolved", "canceled"])
        .values("id", "asset_symbol", "event_id", "interval", "window_start")
    )


class FinanceMarketScheduler:
    def __init__(self, store: PriceStore, interval_seconds: float = 1.0) -> None:
        self.store = store
        self.interval_seconds = interval_seconds
        self._indexed_windows = set()

    async def run(self) -> None:
        while True:
            now = timezone.now()
            await self._ensure_windows(now)
            await self._settle_due(now)
            await asyncio.sleep(self.interval_seconds)

    async def _ensure_windows(self, now: datetime) -> None:
        for symbol, asset in FINANCE_ASSETS.items():
            for interval_key in FINANCE_INTERVALS.keys():
                window = None
                if asset["type"] == "crypto":
                    window = _crypto_window(now, interval_key)
                else:
                    window = _stock_window(now, interval_key)
                if not window:
                    continue
                window_start, window_end = window
                if now >= window_end:
                    continue
                if now < window_start:
                    continue

                latest_price = await self.store.get_price_value(symbol)
                if latest_price is None:
                    continue

                prev_close = await _get_previous_close(symbol, interval_key, window_start)
                prev_close = prev_close or latest_price

                try:
                    window = await _create_finance_event_market(
                        asset_symbol=symbol,
                        interval_key=interval_key,
                        window_start=window_start,
                        window_end=window_end,
                        prev_close_price=prev_close,
                        source=asset["source"],
                        asset_name=asset["name"],
                        asset_type=asset["type"],
                    )
                    key = (symbol, interval_key, window_start)
                    if window:
                        self._indexed_windows.add(key)
                except Exception as exc:
                    logger.warning(
                        "Failed to create finance window %s %s %s: %s",
                        symbol,
                        interval_key,
                        window_start.isoformat(),
                        exc,
                    )

    async def _settle_due(self, now: datetime) -> None:
        due = await _due_windows(now)
        for row in due:
            if row.get("event_id"):
                await _delete_event_from_search(str(row["event_id"]))
            key = (row["asset_symbol"], row["interval"], row["window_start"])
            self._indexed_windows.discard(key)
            symbol = row["asset_symbol"]
            latest_price = await self.store.get_price_value(symbol)
            if latest_price is None:
                continue
            try:
                await _settle_window(row["id"], latest_price)
            except Exception as exc:
                logger.warning("Failed to settle finance window %s: %s", row["id"], exc)
