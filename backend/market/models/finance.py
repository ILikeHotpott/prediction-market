from django.db import models
from django.utils import timezone


class FinanceMarketWindow(models.Model):
    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        "market.Event",
        db_column="event_id",
        on_delete=models.DO_NOTHING,
        related_name="finance_windows",
    )
    market = models.OneToOneField(
        "market.Market",
        db_column="market_id",
        on_delete=models.DO_NOTHING,
        related_name="finance_window",
    )
    asset_symbol = models.TextField()
    asset_name = models.TextField()
    asset_type = models.TextField()
    interval = models.TextField()
    window_start = models.DateTimeField()
    window_end = models.DateTimeField()
    prev_close_price = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    close_price = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    price_precision = models.IntegerField(default=2)
    source = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "finance_market_windows"

    def __str__(self) -> str:
        return f"{self.asset_symbol}:{self.interval}:{self.window_start.isoformat()}"
