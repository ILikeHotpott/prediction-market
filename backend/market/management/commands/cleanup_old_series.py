"""
Management command to cleanup old series data.
Run this periodically (e.g., daily via cron) to prevent table bloat.

Usage:
    python manage.py cleanup_old_series --days 30
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from market.models import MarketOptionSeries


class Command(BaseCommand):
    help = 'Remove series data older than specified days'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Number of days of data to keep (default: 30)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without actually deleting',
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']

        cutoff = timezone.now() - timezone.timedelta(days=days)

        qs = MarketOptionSeries.objects.filter(bucket_start__lt=cutoff)
        count = qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'DRY RUN: Would delete {count} series records older than {days} days'
                )
            )
        else:
            deleted, _ = qs.delete()
            self.stdout.write(
                self.style.SUCCESS(
                    f'Successfully deleted {deleted} series records older than {days} days'
                )
            )
