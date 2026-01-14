"""
Django management command for series data maintenance.
Price recording now happens automatically on each trade (in execution.py).

Usage:
    python manage.py record_prices --cleanup
    python manage.py record_prices --backfill
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from market.models import Trade, MarketOption, MarketOptionSeries
from market.services.series_recorder import cleanup_old_series


class Command(BaseCommand):
    help = 'Maintain market price series data (cleanup or backfill)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--cleanup',
            action='store_true',
            help='Clean up old series data'
        )
        parser.add_argument(
            '--cleanup-days',
            type=int,
            default=30,
            help='Days of data to keep when cleaning up (default: 30)'
        )
        parser.add_argument(
            '--backfill',
            action='store_true',
            help='Rebuild series data from trades table'
        )

    def handle(self, *args, **options):
        cleanup = options['cleanup']
        cleanup_days = options['cleanup_days']
        backfill = options['backfill']

        if cleanup:
            deleted = cleanup_old_series(cleanup_days)
            self.stdout.write(self.style.SUCCESS(f'Cleaned up {deleted} old series records'))
        elif backfill:
            self._backfill_from_trades()
        else:
            self.stdout.write(
                'Price recording now happens automatically on each trade.\n'
                'Use --cleanup to remove old series data.\n'
                'Use --backfill to rebuild series data from trades.'
            )

    def _backfill_from_trades(self):
        """Rebuild series data from trades table using price_bps from each trade."""
        self.stdout.write('Starting backfill from trades...')

        # Clear existing series data
        deleted, _ = MarketOptionSeries.objects.all().delete()
        self.stdout.write(f'Deleted {deleted} existing series records')

        # Get all trades with price_bps, ordered by time
        trades = Trade.objects.filter(
            price_bps__isnull=False
        ).select_related('option').order_by('block_time')

        total = trades.count()
        self.stdout.write(f'Processing {total} trades with price data...')

        series_to_create = []
        for i, trade in enumerate(trades.iterator()):
            option = trade.option
            if not option or option.side != 'yes':
                continue

            series_to_create.append(MarketOptionSeries(
                option_id=option.id,
                market_id=option.market_id,
                interval="1M",
                bucket_start=trade.block_time,
                value_bps=trade.price_bps,
                created_at=trade.block_time,
            ))

            if (i + 1) % 100 == 0:
                self.stdout.write(f'Processed {i + 1}/{total} trades...')

        # Bulk create all series entries
        if series_to_create:
            with transaction.atomic():
                MarketOptionSeries.objects.bulk_create(
                    series_to_create,
                    update_conflicts=True,
                    update_fields=["value_bps", "created_at"],
                    unique_fields=["option_id", "interval", "bucket_start"],
                )
            self.stdout.write(self.style.SUCCESS(f'Created {len(series_to_create)} series records'))
        else:
            self.stdout.write(self.style.WARNING('No series records to create'))
