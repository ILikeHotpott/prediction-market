"""
Service for market_option_series table maintenance.
Price recording now happens automatically in execution.py after each trade.
"""

from django.utils import timezone

from ..models import MarketOptionSeries


def cleanup_old_series(days_to_keep: int = 30):
    """
    Remove series data older than specified days to prevent table bloat.
    """
    cutoff = timezone.now() - timezone.timedelta(days=days_to_keep)
    deleted, _ = MarketOptionSeries.objects.filter(bucket_start__lt=cutoff).delete()
    return deleted
