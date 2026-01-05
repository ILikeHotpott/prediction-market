import secrets
from django.db import models
from django.utils import timezone


class RedemptionCode(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=32, unique=True)
    amount = models.DecimalField(max_digits=40, decimal_places=18)
    token = models.TextField(default="USDC")
    status = models.TextField(default="active")  # active, used, expired
    created_by = models.ForeignKey(
        "market.User",
        db_column="created_by",
        on_delete=models.DO_NOTHING,
        related_name="created_codes",
    )
    used_by = models.ForeignKey(
        "market.User",
        db_column="used_by",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="redeemed_codes",
    )
    created_at = models.DateTimeField(default=timezone.now)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "redemption_codes"

    @staticmethod
    def generate_code():
        return secrets.token_hex(8).upper()

    def __str__(self):
        return f"{self.code}:{self.amount}:{self.status}"
