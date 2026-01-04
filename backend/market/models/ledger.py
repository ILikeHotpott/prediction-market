from django.db import models
from django.utils import timezone


class BalanceSnapshot(models.Model):
    id = models.BigAutoField(primary_key=True)
    token = models.TextField()
    available_amount = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    locked_amount = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    updated_at = models.DateTimeField(default=timezone.now)
    user = models.ForeignKey(
        "market.User", db_column="user_id", on_delete=models.DO_NOTHING, related_name="balances"
    )

    class Meta:
        managed = False
        db_table = "balance_snapshot"

    def __str__(self) -> str:
        return f"{self.user_id}:{self.token}:{self.available_amount}"


class Position(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        "market.User", db_column="user_id", on_delete=models.DO_NOTHING, related_name="positions"
    )
    market = models.ForeignKey(
        "market.Market",
        db_column="market_id",
        on_delete=models.DO_NOTHING,
        related_name="positions",
    )
    option = models.ForeignKey(
        "market.MarketOption",
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
        "market.User",
        db_column="user_id",
        on_delete=models.DO_NOTHING,
        related_name="order_intents",
    )
    wallet = models.ForeignKey(
        "market.Wallet",
        db_column="wallet_id",
        on_delete=models.DO_NOTHING,
        related_name="order_intents",
    )
    market = models.ForeignKey(
        "market.Market",
        db_column="market_id",
        on_delete=models.DO_NOTHING,
        related_name="order_intents",
    )
    option = models.ForeignKey(
        "market.MarketOption",
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


class Trade(models.Model):
    id = models.BigAutoField(primary_key=True)
    chain = models.TextField()
    tx_hash = models.TextField()
    block_number = models.BigIntegerField()
    block_time = models.DateTimeField()
    market = models.ForeignKey(
        "market.Market", db_column="market_id", on_delete=models.DO_NOTHING, related_name="trades"
    )
    option = models.ForeignKey(
        "market.MarketOption",
        db_column="option_id",
        on_delete=models.DO_NOTHING,
        related_name="trades",
    )
    user = models.ForeignKey(
        "market.User",
        db_column="user_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="trades",
    )
    wallet = models.ForeignKey(
        "market.Wallet",
        db_column="wallet_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="trades",
    )
    side = models.TextField()
    amount_in = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    shares = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    price_bps = models.IntegerField(null=True, blank=True)
    fee_amount = models.DecimalField(max_digits=40, decimal_places=18, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    log_index = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = "trades"


class TxRequest(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        "market.User",
        db_column="user_id",
        on_delete=models.DO_NOTHING,
        related_name="tx_requests",
    )
    wallet = models.ForeignKey(
        "market.Wallet",
        db_column="wallet_id",
        on_delete=models.DO_NOTHING,
        related_name="tx_requests",
    )
    kind = models.TextField()
    chain = models.TextField()
    expected_amount = models.DecimalField(max_digits=40, decimal_places=18, null=True, blank=True)
    status = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)
    error_msg = models.TextField(null=True, blank=True)
    tx_hash = models.TextField(null=True, blank=True)
    token = models.TextField(null=True, blank=True)
    to_address = models.TextField(null=True, blank=True)
    from_address = models.TextField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    block_number = models.BigIntegerField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "tx_requests"


class ChainEvent(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        "market.User",
        db_column="user_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="chain_events",
    )
    market = models.ForeignKey(
        "market.Market",
        db_column="market_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="chain_events",
    )
    chain = models.TextField()
    event_type = models.TextField()
    token = models.TextField(null=True, blank=True)
    amount = models.DecimalField(max_digits=40, decimal_places=18, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    block_number = models.BigIntegerField()
    block_time = models.DateTimeField()
    tx_hash = models.TextField(null=True, blank=True)
    log_index = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = "chain_events"


class MarketSettlement(models.Model):
    """
    Audit table recording market settlement details.
    One settlement record per market (unique constraint on market_id).
    """

    id = models.BigAutoField(primary_key=True)
    market = models.OneToOneField(
        "market.Market",
        db_column="market_id",
        on_delete=models.DO_NOTHING,
        related_name="settlement",
    )
    resolved_option = models.ForeignKey(
        "market.MarketOption",
        db_column="resolved_option_id",
        on_delete=models.DO_NOTHING,
        related_name="settlements",
    )
    total_payout = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    pool_cash_used = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    collateral_used = models.DecimalField(max_digits=40, decimal_places=18, default=0)
    settled_by = models.ForeignKey(
        "market.User",
        db_column="settled_by",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="settlements_made",
    )
    settled_at = models.DateTimeField(default=timezone.now)
    settlement_tx_id = models.TextField()

    class Meta:
        managed = False
        db_table = "market_settlements"

    def __str__(self) -> str:
        return f"Settlement:{self.market_id}:{self.settlement_tx_id}"


