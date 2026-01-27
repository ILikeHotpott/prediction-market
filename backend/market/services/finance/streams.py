import asyncio
import json
import logging
import os
import time
from datetime import datetime
from typing import Optional

import websockets
from channels.layers import get_channel_layer
from django.core.cache import cache
from django.utils import timezone

from .constants import (
    BINANCE_STREAM_SYMBOLS,
    BINANCE_SYMBOL_MAP,
    FINNHUB_SYMBOLS,
    FINNHUB_SYMBOL_MAP,
)
from .price_store import PriceStore

logger = logging.getLogger(__name__)


class PriceBroadcaster:
    def __init__(self, min_interval: float = 0.5) -> None:
        self._min_interval = min_interval
        self._last_sent = {}
        self._channel_layer = get_channel_layer()
        self._series_key_prefix = "finance_series:"
        self._series_limit = 1200

    async def broadcast(self, symbol: str, price, ts: datetime) -> None:
        now = time.monotonic()
        last = self._last_sent.get(symbol, 0)
        if now - last < self._min_interval:
            return
        self._last_sent[symbol] = now
        cache.set(
            f"finance_price:{symbol}",
            {"price": float(price), "ts": ts.isoformat()},
            timeout=60,
        )
        series_key = f"{self._series_key_prefix}{symbol}"
        series = cache.get(series_key) or []
        series.append({"ts": ts.isoformat(), "price": float(price)})
        if len(series) > self._series_limit:
            series = series[-self._series_limit :]
        cache.set(series_key, series, timeout=60 * 30)
        if not self._channel_layer:
            return
        await self._channel_layer.group_send(
            f"finance_price_{symbol}",
            {
                "type": "finance.price",
                "symbol": symbol,
                "price": float(price),
                "ts": ts.isoformat(),
            },
        )


async def _run_binance_stream(store: PriceStore, broadcaster: PriceBroadcaster, stop_event: asyncio.Event) -> None:
    if not BINANCE_STREAM_SYMBOLS:
        logger.warning("Binance stream symbols empty; skipping Binance stream.")
        return

    stream_names = [f"{s}@trade" for s in BINANCE_STREAM_SYMBOLS]
    url = f"wss://stream.binance.com:9443/stream?streams={'/'.join(stream_names)}"
    backoff = 1

    while not stop_event.is_set():
        try:
            async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                backoff = 1
                async for message in ws:
                    if stop_event.is_set():
                        break
                    payload = json.loads(message)
                    data = payload.get("data") or {}
                    raw_symbol = str(data.get("s") or "").upper()
                    symbol = BINANCE_SYMBOL_MAP.get(raw_symbol)
                    if not symbol:
                        continue
                    price = data.get("p") or data.get("c")
                    if price is None:
                        continue
                    ts = timezone.now()
                    point = await store.set_price(symbol, price, ts)
                    await broadcaster.broadcast(symbol, point.price, point.ts)
        except Exception as exc:
            logger.warning("Binance stream error: %s", exc)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


async def _run_finnhub_stream(store: PriceStore, broadcaster: PriceBroadcaster, stop_event: asyncio.Event) -> None:
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        logger.warning("FINNHUB_API_KEY not set; skipping Finnhub stream.")
        return

    url = f"wss://ws.finnhub.io?token={api_key}"
    backoff = 1

    while not stop_event.is_set():
        try:
            async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                backoff = 1
                for symbol in FINNHUB_SYMBOLS:
                    await ws.send(json.dumps({"type": "subscribe", "symbol": symbol}))
                async for message in ws:
                    if stop_event.is_set():
                        break
                    payload = json.loads(message)
                    if payload.get("type") != "trade":
                        continue
                    trades = payload.get("data") or []
                    if not trades:
                        continue
                    for trade in trades:
                        raw_symbol = str(trade.get("s") or "").upper()
                        symbol = FINNHUB_SYMBOL_MAP.get(raw_symbol)
                        if not symbol:
                            continue
                        price = trade.get("p")
                        if price is None:
                            continue
                        ts = timezone.now()
                        point = await store.set_price(symbol, price, ts)
                        await broadcaster.broadcast(symbol, point.price, point.ts)
        except Exception as exc:
            logger.warning("Finnhub stream error: %s", exc)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


class PriceStreamManager:
    def __init__(self, store: Optional[PriceStore] = None, min_broadcast_interval: float = 0.5) -> None:
        self.store = store or PriceStore()
        self.broadcaster = PriceBroadcaster(min_interval=min_broadcast_interval)
        self.stop_event = asyncio.Event()
        self._tasks = []

    async def start(self) -> None:
        if self._tasks:
            return
        self._tasks = [
            asyncio.create_task(_run_binance_stream(self.store, self.broadcaster, self.stop_event)),
            asyncio.create_task(_run_finnhub_stream(self.store, self.broadcaster, self.stop_event)),
        ]
        await asyncio.gather(*self._tasks)

    async def stop(self) -> None:
        if not self._tasks:
            return
        self.stop_event.set()
        for task in self._tasks:
            task.cancel()
        self._tasks = []
