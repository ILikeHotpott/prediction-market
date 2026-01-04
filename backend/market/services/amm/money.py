import math
from decimal import Decimal, ROUND_DOWN
from typing import List, Sequence, Union

from .errors import QuoteInputError

Number = Union[Decimal, int, float, str]

# Shares precision: 8 decimal places
SHARES_QUANT = Decimal("0.00000001")


def _to_decimal(x: Number, field: str) -> Decimal:
    try:
        if isinstance(x, Decimal):
            return x
        return Decimal(str(x))
    except Exception as e:
        raise QuoteInputError(f"{field} must be number-like, got={x!r}") from e


def _finite_pos_float(x: Decimal, field: str) -> float:
    v = float(x)
    if not math.isfinite(v):
        raise QuoteInputError(f"{field} must be finite")
    return v


def _fee_rate_from_bps(fee_bps: int) -> Decimal:
    # fee_bps==10000 => 100% fee => division by zero in gross-up. reject.
    if fee_bps < 0 or fee_bps >= 10000:
        raise QuoteInputError("fee_bps must be in [0, 9999]")
    return Decimal(fee_bps) / Decimal(10000)


def _bps_from_probabilities(probabilities: Sequence[float]) -> List[int]:
    out: List[int] = []
    for p in probabilities:
        if p < 0.0:
            p = 0.0
        elif p > 1.0:
            p = 1.0
        out.append(int(round(p * 10000.0)))
    return out


def _quantize_money(x: Decimal, money_quant: Decimal, rounding) -> Decimal:
    # money_quant e.g. 0.01 / 0.000001
    return x.quantize(money_quant, rounding=rounding)


def _quantize_shares(x: float) -> Decimal:
    """Quantize shares to 8 decimal places, rounding down to be conservative."""
    return Decimal(str(x)).quantize(SHARES_QUANT, rounding=ROUND_DOWN)

