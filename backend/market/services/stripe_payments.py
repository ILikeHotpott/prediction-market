from dataclasses import dataclass
from decimal import Decimal


USD_TO_COIN_RATE = Decimal("100")


@dataclass(frozen=True)
class CoinPackage:
    id: str
    name: str
    usd_amount: Decimal
    coins: int
    bonus_coins: int
    badge: str | None = None
    highlight: bool = False

    @property
    def credit_amount(self) -> Decimal:
        return Decimal(self.coins)


COIN_PACKAGES = [
    CoinPackage(
        id="starter",
        name="Starter",
        usd_amount=Decimal("1"),
        coins=100,
        bonus_coins=0,
    ),
    CoinPackage(
        id="boost-10",
        name="Boost",
        usd_amount=Decimal("10"),
        coins=1100,
        bonus_coins=100,
        badge="+100 bonus",
    ),
    CoinPackage(
        id="power-30",
        name="Power",
        usd_amount=Decimal("30"),
        coins=3500,
        bonus_coins=500,
        badge="+500 bonus",
    ),
    CoinPackage(
        id="pro-52",
        name="Pro",
        usd_amount=Decimal("52"),
        coins=6200,
        bonus_coins=1000,
        badge="+1,000 bonus",
    ),
    CoinPackage(
        id="elite-99",
        name="Elite",
        usd_amount=Decimal("99"),
        coins=11900,
        bonus_coins=2000,
        badge="Best value",
        highlight=True,
    ),
    CoinPackage(
        id="whale-198",
        name="Whale",
        usd_amount=Decimal("198"),
        coins=24800,
        bonus_coins=5000,
        badge="+5,000 bonus",
    ),
]


def list_coin_packages():
    return COIN_PACKAGES


def get_coin_package(package_id: str | None) -> CoinPackage | None:
    if not package_id:
        return None
    for pkg in COIN_PACKAGES:
        if pkg.id == package_id:
            return pkg
    return None


def serialize_coin_package(pkg: CoinPackage) -> dict:
    return {
        "id": pkg.id,
        "name": pkg.name,
        "usd_amount": str(pkg.usd_amount),
        "coins": pkg.coins,
        "bonus_coins": pkg.bonus_coins,
        "badge": pkg.badge,
        "highlight": pkg.highlight,
        "credit_amount": str(pkg.credit_amount),
    }
