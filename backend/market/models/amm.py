import uuid

from django.db import models
from django.utils import timezone


class AmmPool(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    market = models.OneToOneField(
        "market.Market",
        db_column="market_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="amm_pool",
    )
    event = models.OneToOneField(
        "market.Event",
        db_column="event_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="amm_pool",
    )
    model = models.TextField(default="lmsr")
    status = models.TextField(default="active")
    b = models.DecimalField(max_digits=40, decimal_places=18)
    fee_bps = models.IntegerField(default=0)
    collateral_token = models.TextField()
    funding_amount = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    collected_fee = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    # Initial funding amount (subsidy cap F). Used to compute b = F/ln(N).
    collateral_amount = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    # Net cash from trading (buys - sell payouts). Primary source for settlement.
    pool_cash = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    fee_recipient_user = models.ForeignKey(
        "market.User",
        db_column="fee_recipient_user_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="fee_recipient_pools",
    )
    created_by = models.ForeignKey(
        "market.User",
        db_column="created_by",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="created_amm_pools",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "amm_pools"

    def __str__(self) -> str:
        return f"{self.id}"


class AmmPoolOptionState(models.Model):
    option = models.OneToOneField(
        "market.MarketOption",
        primary_key=True,
        db_column="option_id",
        on_delete=models.DO_NOTHING,
        related_name="amm_state",
    )
    pool = models.ForeignKey(
        AmmPool, db_column="pool_id", on_delete=models.DO_NOTHING, related_name="option_states"
    )
    q = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "amm_pool_option_state"
        unique_together = ("pool", "option")


