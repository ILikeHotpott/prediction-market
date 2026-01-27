import asyncio
import logging

from django.core.management.base import BaseCommand

from market.services.finance import FinanceMarketScheduler, PriceStreamManager

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run finance realtime price streams and market scheduler."

    def handle(self, *args, **options):
        asyncio.run(self._run())

    async def _run(self):
        manager = PriceStreamManager(min_broadcast_interval=0.5)
        scheduler = FinanceMarketScheduler(manager.store, interval_seconds=0.5)

        self.stdout.write("Starting finance realtime service (streams + scheduler)...")
        await asyncio.gather(
            manager.start(),
            scheduler.run(),
        )
