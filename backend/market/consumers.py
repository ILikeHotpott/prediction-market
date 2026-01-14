import json
import asyncio
from datetime import timedelta
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone

INTERVAL_HOURS = {
    "1M": 1/60,
    "1H": 1,
    "4H": 4,
    "1D": 24,
    "1W": 168,
    "ALL": None,
}


class SeriesConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for streaming market series data."""

    async def connect(self):
        self.event_id = self.scope["url_route"]["kwargs"]["event_id"]
        self.group_name = f"series_{self.event_id}"
        self.interval = "ALL"
        self.streaming = False

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        self.streaming = False
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        """Handle incoming messages from client."""
        try:
            data = json.loads(text_data)
            action = data.get("action")

            if action == "subscribe":
                self.interval = data.get("interval", "ALL").upper()
                if self.interval not in INTERVAL_HOURS:
                    self.interval = "ALL"
                await self.send_series_data()
                self.streaming = True
                asyncio.create_task(self.stream_updates())

            elif action == "change_interval":
                self.interval = data.get("interval", "ALL").upper()
                if self.interval not in INTERVAL_HOURS:
                    self.interval = "ALL"
                await self.send_series_data()

        except json.JSONDecodeError:
            await self.send(json.dumps({"error": "Invalid JSON"}))

    async def send_series_data(self):
        """Fetch and send series data to client."""
        data = await self.get_series_data()
        await self.send(json.dumps({"type": "series", "data": data}))

    async def stream_updates(self):
        """Periodically send updates while connected."""
        while self.streaming:
            # Reduce polling frequency: 1M every 5s, others every 10s
            delay = 5 if self.interval == "1M" else 10
            await asyncio.sleep(delay)
            if self.streaming:
                await self.send_series_data()

    @database_sync_to_async
    def get_series_data(self):
        """Get series data for the event."""
        from .models import Event, Market, MarketOption, MarketOptionSeries, MarketOptionStats

        try:
            event = Event.objects.get(id=self.event_id)
        except Event.DoesNotExist:
            return {"error": "Event not found", "series": {}, "event_type": "standalone"}

        markets = list(Market.objects.filter(event_id=self.event_id, is_hidden=False))
        event_type = event.group_rule  # standalone, exclusive, independent

        # Get all Yes options for the markets
        market_ids = [m.id for m in markets]
        options = list(MarketOption.objects.filter(
            market_id__in=market_ids,
            side="yes",
            is_active=True,
        ).select_related("market"))

        # Build option info for frontend
        option_info = {}
        for opt in options:
            market = next((m for m in markets if m.id == opt.market_id), None)
            option_info[str(opt.id)] = {
                "market_id": str(opt.market_id),
                "label": market.bucket_label or market.title if market else opt.title,
                "option_index": opt.option_index,
            }

        # Query series data with strict limits
        hours = INTERVAL_HOURS.get(self.interval)
        now = timezone.now()

        qs = MarketOptionSeries.objects.filter(option_id__in=[o.id for o in options])
        if hours:
            start_time = now - timedelta(hours=hours)
            qs = qs.filter(bucket_start__gte=start_time)
        else:
            # For "ALL" interval, limit to last 7 days to prevent egress explosion
            start_time = now - timedelta(days=7)
            qs = qs.filter(bucket_start__gte=start_time)

        # Hard limit: max 2000 points per option to cap response size
        qs = qs.order_by("option_id", "bucket_start")[:2000]

        # Group by option_id
        series = {}
        for row in qs:
            opt_id = str(row.option_id)
            if opt_id not in series:
                series[opt_id] = []
            series[opt_id].append({
                "bucket_start": row.bucket_start.isoformat(),
                "value_bps": row.value_bps,
            })

        # If no historical data, add current prices
        if not any(series.values()):
            stats = MarketOptionStats.objects.filter(option_id__in=[o.id for o in options])
            for stat in stats:
                opt_id = str(stat.option_id)
                series[opt_id] = [{
                    "bucket_start": now.isoformat(),
                    "value_bps": stat.prob_bps,
                }]

        return {
            "series": series,
            "option_info": option_info,
            "event_type": event_type,
            "interval": self.interval,
        }

    async def series_update(self, event):
        """Handle series update broadcast from channel layer."""
        await self.send(json.dumps({
            "type": "series",
            "data": event["data"],
        }))
