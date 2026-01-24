import uuid

from django.db import models
from django.utils import timezone


class Event(models.Model):
    """
    UI 聚合层。一个 Event 下可以有多个 Market（二元），也可以只有一个。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.TextField()
    description = models.TextField(default="", blank=True)
    cover_url = models.TextField(null=True, blank=True)
    category = models.TextField(null=True, blank=True)
    status = models.TextField(default="draft")
    is_hidden = models.BooleanField(default=False)
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
        related_name="created_events",
    )
    group_rule = models.TextField(default="standalone")
    primary_market = models.ForeignKey(
        "market.Market",
        db_column="primary_market_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="primary_for_events",
    )
    resolved_market = models.ForeignKey(
        "market.Market",
        db_column="resolved_market_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="resolved_for_events",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolve_type = models.TextField(default="admin")
    trading_deadline = models.DateTimeField(null=True, blank=True)
    resolution_deadline = models.DateTimeField(null=True, blank=True)

    # Match-specific fields
    team_a_name = models.TextField(null=True, blank=True)
    team_a_image_url = models.TextField(null=True, blank=True)
    team_a_color = models.TextField(default="#22c55e", blank=True)
    team_b_name = models.TextField(null=True, blank=True)
    team_b_image_url = models.TextField(null=True, blank=True)
    team_b_color = models.TextField(default="#ef4444", blank=True)
    allows_draw = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = "events"

    def __str__(self) -> str:
        return self.title


