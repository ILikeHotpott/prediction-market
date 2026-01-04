"""
Service to record price history to market_option_series table.
This enables the trend chart to display historical price movements.
"""

from decimal import Decimal
from django.utils import timezone
from django.db import connection

from ..models import Market, MarketOption, MarketOptionStats, MarketOptionSeries


def _round_to_bucket(dt, bucket_seconds=5):
    """
    Round a datetime to the nearest bucket boundary.
    This ensures consistent bucket_start values across all writers.
    """
    dt = dt.replace(microsecond=0)
    second = (dt.second // bucket_seconds) * bucket_seconds
    return dt.replace(second=second)


def record_current_prices():
    """
    Record current prices for all active market options to the series table.
    Should be called periodically (e.g., every few seconds) to build price history.

    Uses 5-second buckets to align with trade recording and avoid spikes.
    """
    now = timezone.now()
    bucket = _round_to_bucket(now, bucket_seconds=5)

    # Get all active markets
    active_markets = Market.objects.filter(
        status='active',
        is_hidden=False
    ).values_list('id', flat=True)

    # Get all yes options for active markets with their current stats
    options_with_stats = MarketOption.objects.filter(
        market_id__in=active_markets,
        side='yes',
        is_active=True
    ).select_related('stats')

    records_to_create = []
    for option in options_with_stats:
        try:
            prob_bps = option.stats.prob_bps if hasattr(option, 'stats') and option.stats else 5000
        except MarketOptionStats.DoesNotExist:
            prob_bps = 5000  # Default to 50%

        records_to_create.append(MarketOptionSeries(
            option_id=option.id,
            market_id=option.market_id,
            interval='1M',  # 1-minute granularity
            bucket_start=bucket,
            value_bps=prob_bps
        ))

    if records_to_create:
        # Use update_conflicts to update existing bucket with latest price
        # This ensures trade prices are preserved if they wrote first
        MarketOptionSeries.objects.bulk_create(
            records_to_create,
            update_conflicts=True,
            unique_fields=['option_id', 'interval', 'bucket_start'],
            update_fields=['value_bps'],
        )

    return len(records_to_create)


def record_price_for_option(option_id: int, market_id, prob_bps: int):
    """
    Record a single price point for an option.
    Called after each trade to capture price changes.

    Uses 5-second buckets to align with periodic recording.
    """
    now = timezone.now()
    bucket = _round_to_bucket(now, bucket_seconds=5)

    MarketOptionSeries.objects.update_or_create(
        option_id=option_id,
        interval='1M',
        bucket_start=bucket,
        defaults={
            'market_id': market_id,
            'value_bps': prob_bps,
        }
    )


def record_prices_for_market(market_id, prob_bps_list: list):
    """
    Record prices for all options in a market after a trade.
    prob_bps_list is indexed by option_index.

    Uses 5-second buckets to align with periodic recording.
    """
    now = timezone.now()
    bucket = _round_to_bucket(now, bucket_seconds=5)

    options = MarketOption.objects.filter(
        market_id=market_id,
        side='yes',
        is_active=True
    ).order_by('option_index')

    records = []
    for option in options:
        idx = option.option_index or 0
        if idx < len(prob_bps_list):
            records.append(MarketOptionSeries(
                option_id=option.id,
                market_id=market_id,
                interval='1M',
                bucket_start=bucket,
                value_bps=prob_bps_list[idx]
            ))

    if records:
        MarketOptionSeries.objects.bulk_create(
            records,
            update_conflicts=True,
            unique_fields=['option_id', 'interval', 'bucket_start'],
            update_fields=['value_bps'],
        )


def cleanup_old_series(days_to_keep: int = 30):
    """
    Remove series data older than specified days to prevent table bloat.
    """
    cutoff = timezone.now() - timezone.timedelta(days=days_to_keep)
    deleted, _ = MarketOptionSeries.objects.filter(bucket_start__lt=cutoff).delete()
    return deleted
