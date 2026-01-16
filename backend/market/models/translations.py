from django.db import models


class Translation(models.Model):
    entity_type = models.CharField(max_length=50)  # 'event', 'market', 'market_option'
    entity_id = models.CharField(max_length=100)
    field_name = models.CharField(max_length=50)  # 'title', 'description'
    language = models.CharField(max_length=10)  # 'en', 'zh', 'es', 'pt', 'ja'
    translated_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "translations"
        managed = False
        unique_together = [["entity_type", "entity_id", "field_name", "language"]]

    def __str__(self):
        return f"{self.entity_type}:{self.entity_id}:{self.field_name}:{self.language}"


class EventTranslation(models.Model):
    """Pre-translated event titles and descriptions."""
    event = models.ForeignKey(
        "market.Event",
        on_delete=models.CASCADE,
        related_name="translations",
    )
    language = models.CharField(max_length=10)  # 'zh', 'es', 'pt', 'ja'
    title = models.TextField()
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "event_translations"
        managed = False
        unique_together = [["event", "language"]]

    def __str__(self):
        return f"{self.event_id}:{self.language}"
