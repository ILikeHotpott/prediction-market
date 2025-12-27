import uuid

from django.db import models
from django.utils import timezone


class User(models.Model):
    id = models.UUIDField(primary_key=True)
    display_name = models.TextField(blank=True, default="")
    avatar_url = models.TextField(null=True, blank=True)
    role = models.TextField(blank=True, default="user")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False  # Supabase manages schema; Django should not create migrations.
        db_table = "users"

    def __str__(self) -> str:
        return self.display_name or str(self.id)


class Market(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User, db_column="created_by", null=True, blank=True, on_delete=models.DO_NOTHING
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

    class Meta:
        managed = False  # Supabase manages schema; Django should not create migrations.
        db_table = "markets"

    def __str__(self) -> str:
        return self.title


class MarketOption(models.Model):
    id = models.BigAutoField(primary_key=True)
    market = models.ForeignKey(
        Market,
        db_column="market_id",
        related_name="options",
        on_delete=models.DO_NOTHING,
    )
    option_index = models.SmallIntegerField()
    title = models.TextField()
    is_active = models.BooleanField(default=True)
    onchain_outcome_id = models.TextField(null=True, blank=True)

    class Meta:
        managed = False  # Supabase manages schema; Django should not create migrations.
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
        Market,
        db_column="market_id",
        related_name="option_stats",
        on_delete=models.DO_NOTHING,
    )
    prob_bps = models.IntegerField(default=0)
    volume_24h = models.DecimalField(max_digits=32, decimal_places=8, default=0)
    volume_total = models.DecimalField(max_digits=32, decimal_places=8, default=0)
    last_trade_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "market_option_stats"
