from django.db import models


class Watchlist(models.Model):
    user = models.ForeignKey("market.User", on_delete=models.CASCADE, related_name="watchlist_items")
    event = models.ForeignKey("market.Event", on_delete=models.CASCADE, related_name="watchers")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "watchlist"
        managed = False
        unique_together = ("user", "event")

    def __str__(self):
        return f"{self.user_id} -> {self.event_id}"
