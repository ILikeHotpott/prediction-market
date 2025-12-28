import uuid

from django.db import models
from django.utils import timezone


class User(models.Model):
    id = models.UUIDField(primary_key=True)
    display_name = models.TextField(blank=True, default="")
    avatar_url = models.TextField(null=True, blank=True)
    role = models.TextField(blank=True, default="user")
    primary_wallet = models.ForeignKey(
        "Wallet",
        db_column="primary_wallet_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="primary_users",
    )
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
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "market_option_stats"


class BalanceSnapshot(models.Model):
    id = models.BigAutoField(primary_key=True)
    token = models.TextField()
    available_amount = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    locked_amount = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    updated_at = models.DateTimeField(default=timezone.now)
    user = models.ForeignKey(
        User, db_column="user_id", on_delete=models.DO_NOTHING, related_name="balances"
    )

    class Meta:
        managed = False
        db_table = "balance_snapshot"

    def __str__(self) -> str:
        return f"{self.user_id}:{self.token}:{self.available_amount}"


class Wallet(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField(default=timezone.now)
    user = models.ForeignKey(
        User, db_column="user_id", on_delete=models.DO_NOTHING, related_name="wallets"
    )
    chain_family = models.TextField(default="evm")
    address = models.TextField()
    is_primary = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = "wallets"

    def __str__(self) -> str:
        return f"{self.chain_family}:{self.address}"


class Position(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User, db_column="user_id", on_delete=models.DO_NOTHING, related_name="positions"
    )
    market = models.ForeignKey(
        Market,
        db_column="market_id",
        on_delete=models.DO_NOTHING,
        related_name="positions",
    )
    option = models.ForeignKey(
        MarketOption,
        db_column="option_id",
        on_delete=models.DO_NOTHING,
        related_name="positions",
    )
    shares = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    cost_basis = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "positions"

    def __str__(self) -> str:
        return f"{self.user_id}:{self.market_id}:{self.option_id}"


class OrderIntent(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User, db_column="user_id", on_delete=models.DO_NOTHING, related_name="order_intents"
    )
    wallet = models.ForeignKey(
        Wallet,
        db_column="wallet_id",
        on_delete=models.DO_NOTHING,
        related_name="order_intents",
    )
    market = models.ForeignKey(
        Market, db_column="market_id", on_delete=models.DO_NOTHING, related_name="order_intents"
    )
    option = models.ForeignKey(
        MarketOption,
        db_column="option_id",
        on_delete=models.DO_NOTHING,
        related_name="order_intents",
    )
    side = models.TextField()
    amount_in = models.DecimalField(max_digits=40, decimal_places=18, null=True)
    shares_out = models.DecimalField(max_digits=40, decimal_places=18, null=True)
    max_amount_in = models.DecimalField(max_digits=40, decimal_places=18, null=True)
    min_shares_out = models.DecimalField(max_digits=40, decimal_places=18, null=True)
    chain = models.TextField()
    status = models.TextField(default="created")
    client_nonce = models.TextField(null=True, blank=True)
    tx_hash = models.TextField(null=True, blank=True)
    error_msg = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "order_intents"

    def __str__(self) -> str:
        return f"{self.market_id}:{self.option_id}:{self.side}:{self.status}"
