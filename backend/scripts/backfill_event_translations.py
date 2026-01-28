#!/usr/bin/env python
"""Backfill translations for duplicate events (same title)."""
import os
import sys
import django
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "monofuture.settings")
django.setup()

from market.models import Event
from market.services.translation import get_openrouter_client, translate_event
from market.services.cache import invalidate_event_detail, invalidate_event_list

def main():
    events = list(Event.objects.all())
    if not events:
        print("No events found")
        return

    by_title = defaultdict(list)
    for event in events:
        if event.title:
            by_title[event.title].append(event)

    duplicate_titles = {title for title, items in by_title.items() if len(items) > 1}
    if not duplicate_titles:
        print("No duplicate event titles found")
        return

    can_translate = get_openrouter_client() is not None
    if not can_translate:
        print("OPENROUTER_API_KEY not set; only reusing existing translations.")

    total_groups = len(duplicate_titles)
    print(f"Found {total_groups} duplicate titles to backfill")

    processed = 0
    for title in duplicate_titles:
        events_group = by_title[title]
        print(f"[{processed + 1}/{total_groups}] {title[:80]}")

        for event in events_group:
            try:
                translate_event(event)
                invalidate_event_detail(str(event.id))
            except Exception as exc:
                print(f"  Error: {exc}")

        processed += 1

    invalidate_event_list()
    print("Backfill complete")

if __name__ == "__main__":
    main()
