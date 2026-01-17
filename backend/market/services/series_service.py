"""
Optimized series data service for market charts.
Provides efficient data aggregation and caching for different time intervals.
"""
from datetime import timedelta
from typing import Dict, List, Optional
import uuid
from django.core.cache import cache
from django.utils import timezone
from django.db.models import F, Q

from ..models import MarketOption, MarketOptionSeries, MarketOptionStats


# Cache TTLs per interval (in seconds) - longer cache for bandwidth savings
CACHE_TTL = {
    "1H": 120,    # 2 minutes (was 30s)
    "6H": 300,    # 5 minutes (was 120s)
    "1D": 600,    # 10 minutes (was 300s)
    "1W": 1800,   # 30 minutes (was 600s)
    "ALL": 3600,  # 1 hour (was 1800s)
}

# Time range for each interval
# Extreme optimization: minimal points to reduce egress by 70%+
INTERVAL_CONFIG = {
    "1H": {"hours": 1, "max_points": 30, "bucket_minutes": 2},      # 30 points (was 60)
    "6H": {"hours": 6, "max_points": 36, "bucket_minutes": 10},     # 36 points (was 72)
    "1D": {"hours": 24, "max_points": 48, "bucket_minutes": 30},    # 48 points (was 96)
    "1W": {"hours": 168, "max_points": 56, "bucket_minutes": 180},  # 56 points (was 120)
    "ALL": {"hours": None, "max_points": 100, "bucket_minutes": 360},  # 100 points (was 200)
}


def _is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID."""
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError):
        return False


def get_series_data(market_ids: List[str], interval: str = "1H") -> Dict:
    """
    Get price series data for multiple markets with efficient caching.

    Args:
        market_ids: List of market UUIDs
        interval: Time interval (1H, 6H, 1D, 1W, ALL)

    Returns:
        Dict with series data keyed by option_id
    """
    if not market_ids:
        return {"series": {}}

    # Filter out invalid UUIDs
    valid_market_ids = [mid for mid in market_ids if _is_valid_uuid(mid)]
    if not valid_market_ids:
        return {"series": {}}

    # Normalize interval
    interval = interval.upper()
    if interval not in INTERVAL_CONFIG:
        interval = "1H"

    # Check cache
    cache_key = f"series:v3:{','.join(sorted(valid_market_ids))}:{interval}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    config = INTERVAL_CONFIG[interval]
    now = timezone.now()

    # For ALL, get the earliest data point; otherwise use time range
    if config["hours"] is None:
        start_time = None  # Will fetch all data
    else:
        start_time = now - timedelta(hours=config["hours"])

    max_points = config["max_points"]
    bucket_minutes = config["bucket_minutes"]

    # Get Yes options for the markets
    options = list(
        MarketOption.objects.filter(
            market_id__in=valid_market_ids,
            side="yes",
            is_active=True,
        ).values_list("id", flat=True)
    )

    if not options:
        result = {"series": {}}
        cache.set(cache_key, result, CACHE_TTL.get(interval, 60))
        return result

    # Get current prices
    current_prices = {
        str(s["option_id"]): s["prob_bps"]
        for s in MarketOptionStats.objects.filter(
            option_id__in=options
        ).values("option_id", "prob_bps")
    }

    # Build series data
    series = {}
    for opt_id in options:
        points = _get_option_series(opt_id, start_time, now, max_points, bucket_minutes, current_prices.get(str(opt_id)))
        if points:
            series[str(opt_id)] = points

    result = {"series": series}
    cache.set(cache_key, result, CACHE_TTL.get(interval, 60))
    return result


def _downsample_points(points: List[Dict], max_points: int, bucket_minutes: int) -> List[Dict]:
    """
    Downsample points to reduce data size while preserving trends.
    Uses time-based bucketing to aggregate points.
    """
    if len(points) <= max_points:
        return points

    if bucket_minutes <= 1:
        # Simple decimation for fine-grained intervals
        step = len(points) // max_points
        return points[::max(step, 1)]

    # Time-based bucketing for coarser intervals
    from datetime import datetime
    buckets = {}

    for point in points:
        # Parse timestamp and round to bucket
        ts = datetime.fromisoformat(point["bucket_start"].replace('Z', '+00:00'))
        # Round down to nearest bucket
        bucket_key = ts.replace(
            minute=(ts.minute // bucket_minutes) * bucket_minutes,
            second=0,
            microsecond=0
        )

        # Keep the last value in each bucket (most recent)
        buckets[bucket_key] = point

    # Sort by time and return
    result = [buckets[k] for k in sorted(buckets.keys())]

    # If still too many points, decimate further
    if len(result) > max_points:
        step = len(result) // max_points
        result = result[::max(step, 1)]

    return result


def _get_option_series(
    option_id: int,
    start_time,
    now,
    max_points: int,
    bucket_minutes: int,
    current_price_bps: Optional[int]
) -> List[Dict]:
    """
    Get series data for a single option with optimized querying and downsampling.
    """
    # Build query with optimized field selection
    query = MarketOptionSeries.objects.filter(
        option_id=option_id,
        interval="1M",
    ).only("bucket_start", "value_bps")

    # Apply time filter if start_time is specified
    if start_time is not None:
        query = query.filter(bucket_start__gte=start_time)

    # Fetch minimal points to reduce DB egress
    fetch_limit = min(max_points * 2 if bucket_minutes > 1 else max_points, 500)

    rows = list(
        query.values("bucket_start", "value_bps")
        .order_by("-bucket_start")[:fetch_limit]
    )
    rows.reverse()

    points = [
        {"bucket_start": row["bucket_start"].isoformat(), "value_bps": row["value_bps"]}
        for row in rows
    ]

    # Get anchor point (last known value before the range)
    if start_time is not None:
        last_before = (
            MarketOptionSeries.objects.filter(
                option_id=option_id,
                interval="1M",
                bucket_start__lt=start_time,
            )
            .values("bucket_start", "value_bps")
            .order_by("-bucket_start")
            .first()
        )
    else:
        last_before = None

    # Determine anchor value
    anchor_value = None
    if last_before:
        anchor_value = last_before["value_bps"]
    elif points:
        anchor_value = points[0]["value_bps"]
    elif current_price_bps is not None:
        anchor_value = current_price_bps

    # Add anchor points
    if anchor_value is not None and start_time is not None:
        prefix_points = []

        if last_before:
            prefix_points.append({
                "bucket_start": last_before["bucket_start"].isoformat(),
                "value_bps": anchor_value,
            })

        prefix_points.append({
            "bucket_start": start_time.isoformat(),
            "value_bps": anchor_value,
        })

        points = prefix_points + points

    # Downsample if needed
    if len(points) > max_points:
        points = _downsample_points(points, max_points, bucket_minutes)

    # Always append current price at "now"
    if current_price_bps is not None:
        points.append({
            "bucket_start": now.isoformat(),
            "value_bps": current_price_bps,
        })

    return points


def invalidate_series_cache(market_id: str):
    """
    Invalidate series cache for a specific market.
    Call this after trades to ensure fresh data.
    """
    # We can't easily invalidate all combinations, so we rely on short TTLs
    # For critical updates, consider using cache versioning
    pass


def get_series_incremental(market_ids: List[str], after_timestamp: str, limit: int = 100) -> Dict:
    """
    Get incremental series data after a specific timestamp (A2 optimization).

    This is much more efficient than full fetch for real-time updates.
    Frontend should:
    1. First call: get_series_data() to get initial data
    2. Subsequent calls: get_series_incremental() with last bucket_start

    Args:
        market_ids: List of market UUIDs
        after_timestamp: ISO timestamp string, only return points after this
        limit: Max points per option (default 100)

    Returns:
        Dict with new series data keyed by option_id
    """
    from datetime import datetime

    if not market_ids:
        return {"series": {}, "has_more": False}

    # Filter out invalid UUIDs
    valid_market_ids = [mid for mid in market_ids if _is_valid_uuid(mid)]
    if not valid_market_ids:
        return {"series": {}, "has_more": False}

    # Parse timestamp
    try:
        if after_timestamp.endswith('Z'):
            after_timestamp = after_timestamp[:-1] + '+00:00'
        after_dt = datetime.fromisoformat(after_timestamp)
    except (ValueError, TypeError):
        return {"series": {}, "has_more": False, "error": "invalid timestamp"}

    # Limit to reasonable range
    limit = min(limit, 500)

    # Get Yes options for the markets
    options = list(
        MarketOption.objects.filter(
            market_id__in=valid_market_ids,
            side="yes",
            is_active=True,
        ).values_list("id", flat=True)
    )

    if not options:
        return {"series": {}, "has_more": False}

    # Query new points after timestamp (uses index: option_id, interval, bucket_start)
    # Order by (bucket_start, option_id) to ensure stable pagination when multiple options
    # share the same timestamp. Use bucket_start__gte with exclusion of already-seen
    # option_ids at the cursor timestamp to avoid skipping data points.
    rows = MarketOptionSeries.objects.filter(
        option_id__in=options,
        interval="1M",
        bucket_start__gt=after_dt,
    ).values("option_id", "bucket_start", "value_bps").order_by("bucket_start", "option_id")[:limit + 1]

    rows = list(rows)
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    # Group by option_id
    series = {}
    for row in rows:
        opt_id = str(row["option_id"])
        if opt_id not in series:
            series[opt_id] = []
        series[opt_id].append({
            "bucket_start": row["bucket_start"].isoformat(),
            "value_bps": row["value_bps"],
        })

    return {"series": series, "has_more": has_more}

