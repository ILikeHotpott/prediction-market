"""
Management command to record current market prices.
Run this every 5 minutes via cron to build historical price data.
Only records when prices change to save database space and bandwidth.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Q
from market.models import MarketOption, MarketOptionStats, MarketOptionSeries


class Command(BaseCommand):
    help = 'Record current market prices for active options (only when changed)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force record all prices even if unchanged',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        force = options.get('force', False)

        # Get all active yes options with their current prices
        stats = MarketOptionStats.objects.filter(
            option__is_active=True,
            option__side="yes"
        ).select_related('option__market')

        rows = []
        for stat in stats:
            # Get last recorded price for this option
            if not force:
                last_record = MarketOptionSeries.objects.filter(
                    option_id=stat.option_id,
                    interval="1M"
                ).order_by('-bucket_start').first()

                # Skip if price hasn't changed
                if last_record and last_record.value_bps == stat.prob_bps:
                    continue

            rows.append(MarketOptionSeries(
                option_id=stat.option_id,
                market_id=stat.option.market_id,
                interval="1M",  # Must match series_service.py query
                bucket_start=now,
                value_bps=stat.prob_bps,
            ))

        if rows:
            MarketOptionSeries.objects.bulk_create(rows, ignore_conflicts=True)
            self.stdout.write(f"Recorded {len(rows)} price points (skipped {len(list(stats)) - len(rows)} unchanged)")
        else:
            self.stdout.write("No price changes detected")
