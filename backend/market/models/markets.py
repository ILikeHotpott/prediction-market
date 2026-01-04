import uuid

from django.db import models
from django.utils import timezone


class Market(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(
        "market.Event",
        db_column="event_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="markets",
    )
    title = models.TextField()
    description = models.TextField()
    cover_url = models.TextField(null=True, blank=True)
    category = models.TextField(null=True, blank=True)
    status = models.TextField(default="draft")
    is_hidden = models.BooleanField(default=False)
    trading_deadline = models.DateTimeField()
    resolution_deadline = models.DateTimeField(null=True, blank=True)
    sort_weight = models.IntegerField(default=0)
    slug = models.TextField(unique=True, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(
        "market.User",
        db_column="created_by",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="created_markets",
    )
    chain = models.TextField(null=True, blank=True)
    contract_address = models.TextField(null=True, blank=True)
    onchain_market_id = models.TextField(null=True, blank=True)
    create_tx_hash = models.TextField(null=True, blank=True)
    created_onchain_at = models.DateTimeField(null=True, blank=True)
    resolve_tx_hash = models.TextField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_option_index = models.SmallIntegerField(null=True, blank=True)
    resolve_type = models.TextField(default="admin")
    market_kind = models.TextField(default="binary")
    # Settlement fields
    settled_at = models.DateTimeField(null=True, blank=True)
    settlement_tx_id = models.TextField(null=True, blank=True)
    assertion_text = models.TextField(null=True, blank=True)
    bucket_label = models.TextField(null=True, blank=True)
    legacy_parent_market = models.ForeignKey(
        "self",
        db_column="legacy_parent_market_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="legacy_children",
    )
    legacy_option_id = models.BigIntegerField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "markets"

    def __str__(self) -> str:
        return self.title


class MarketOption(models.Model):
    id = models.BigAutoField(primary_key=True)
    market = models.ForeignKey(
        Market, db_column="market_id", related_name="options", on_delete=models.DO_NOTHING
    )
    option_index = models.SmallIntegerField()
    title = models.TextField()
    is_active = models.BooleanField(default=True)
    onchain_outcome_id = models.TextField(null=True, blank=True)
    side = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "market_options"

    def __str__(self) -> str:
        return f"{self.market_id}:{self.title}"


class MarketOptionStats(models.Model):
    option = models.OneToOneField(
        MarketOption,
        primary_key=True,
        db_column="option_id",
        related_name="stats",
        on_delete=models.DO_NOTHING,
    )
    market = models.ForeignKey(
        Market, db_column="market_id", related_name="option_stats", on_delete=models.DO_NOTHING
    )
    prob_bps = models.IntegerField(default=0)
    volume_24h = models.DecimalField(max_digits=32, decimal_places=8, default=0)
    volume_total = models.DecimalField(max_digits=32, decimal_places=8, default=0)
    last_trade_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "market_option_stats"


class MarketOptionSeries(models.Model):
    id = models.BigAutoField(primary_key=True)
    option = models.ForeignKey(
        MarketOption,
        db_column="option_id",
        on_delete=models.DO_NOTHING,
        related_name="series",
    )
    market = models.ForeignKey(
        Market, db_column="market_id", on_delete=models.DO_NOTHING, related_name="option_series"
    )
    interval = models.TextField()
    bucket_start = models.DateTimeField()
    value_bps = models.IntegerField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "market_option_series"


