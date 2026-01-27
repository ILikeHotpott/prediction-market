import asyncio
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Optional, Tuple

from django.utils import timezone


@dataclass
class PricePoint:
    price: Decimal
    ts: datetime


class PriceStore:
    def __init__(self, precision: int = 2) -> None:
        self._precision = precision
        self._prices: Dict[str, PricePoint] = {}
        self._lock = asyncio.Lock()

    def _normalize_price(self, raw_price) -> Decimal:
        q = Decimal("1").scaleb(-self._precision)
        return Decimal(str(raw_price)).quantize(q, rounding=ROUND_HALF_UP)

    async def set_price(self, symbol: str, raw_price, ts: Optional[datetime] = None) -> PricePoint:
        price = self._normalize_price(raw_price)
        stamp = ts or timezone.now()
        async with self._lock:
            point = PricePoint(price=price, ts=stamp)
            self._prices[symbol] = point
            return point

    async def get_price(self, symbol: str) -> Optional[PricePoint]:
        async with self._lock:
            return self._prices.get(symbol)

    async def snapshot(self) -> Dict[str, PricePoint]:
        async with self._lock:
            return dict(self._prices)

    async def get_price_value(self, symbol: str) -> Optional[Decimal]:
        async with self._lock:
            point = self._prices.get(symbol)
            return point.price if point else None

    async def get_price_float(self, symbol: str) -> Optional[float]:
        async with self._lock:
            point = self._prices.get(symbol)
            return float(point.price) if point else None
