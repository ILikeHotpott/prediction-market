"""
Django management command to record price history for market charts.
Run this command in the background to continuously record prices.

Usage:
    python manage.py record_prices --interval 5
"""

import time
import signal
import sys
from django.core.management.base import BaseCommand

from market.services.series_recorder import record_current_prices, cleanup_old_series


class Command(BaseCommand):
    help = 'Record current market prices to series table for chart display'

    def __init__(self):
        super().__init__()
        self.running = True

    def add_arguments(self, parser):
        parser.add_argument(
            '--interval',
            type=int,
            default=5,
            help='Interval in seconds between price recordings (default: 5)'
        )
        parser.add_argument(
            '--once',
            action='store_true',
            help='Record prices once and exit'
        )
        parser.add_argument(
            '--cleanup',
            action='store_true',
            help='Clean up old series data and exit'
        )
        parser.add_argument(
            '--cleanup-days',
            type=int,
            default=30,
            help='Days of data to keep when cleaning up (default: 30)'
        )

    def handle(self, *args, **options):
        interval = options['interval']
        once = options['once']
        cleanup = options['cleanup']
        cleanup_days = options['cleanup_days']

        if cleanup:
            deleted = cleanup_old_series(cleanup_days)
            self.stdout.write(self.style.SUCCESS(f'Cleaned up {deleted} old series records'))
            return

        # Handle graceful shutdown
        def signal_handler(sig, frame):
            self.stdout.write('\nShutting down...')
            self.running = False

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        self.stdout.write(self.style.SUCCESS(f'Starting price recorder (interval: {interval}s)'))

        if once:
            count = record_current_prices()
            self.stdout.write(self.style.SUCCESS(f'Recorded {count} price points'))
            return

        # Continuous recording loop
        while self.running:
            try:
                count = record_current_prices()
                self.stdout.write(f'Recorded {count} price points')
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Error recording prices: {e}'))

            # Sleep in small increments to allow for graceful shutdown
            for _ in range(interval):
                if not self.running:
                    break
                time.sleep(1)

        self.stdout.write(self.style.SUCCESS('Price recorder stopped'))
