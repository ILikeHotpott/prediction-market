import uuid

from django.db import models
from django.utils import timezone


class Tag(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    sort_order = models.IntegerField(default=0)
    is_nav = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "tags"


class EventTag(models.Model):
    event = models.ForeignKey(
        "market.Event",
        db_column="event_id",
        on_delete=models.DO_NOTHING,
        related_name="event_tags",
        primary_key=True,
    )
    tag = models.ForeignKey(
        Tag,
        db_column="tag_id",
        on_delete=models.DO_NOTHING,
        related_name="event_tags",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "event_tags"
        unique_together = ("event", "tag")


class MarketTag(models.Model):
    market = models.ForeignKey(
        "market.Market",
        db_column="market_id",
        on_delete=models.DO_NOTHING,
        related_name="market_tags",
        primary_key=True,
    )
    tag = models.ForeignKey(
        Tag,
        db_column="tag_id",
        on_delete=models.DO_NOTHING,
        related_name="market_tags",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "market_tags"
        unique_together = ("market", "tag")


