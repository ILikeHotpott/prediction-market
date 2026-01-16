#!/usr/bin/env python
"""Backfill translations for existing events."""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "monofuture.settings")
django.setup()

from market.models import Event
from market.services.translation import translate_event

def main():
    events = Event.objects.all()
    total = events.count()
    print(f"Found {total} events to translate")

    for i, event in enumerate(events, 1):
        print(f"[{i}/{total}] Translating: {event.title[:50]}...")
        try:
            translate_event(event)
            print(f"  Done")
        except Exception as e:
            print(f"  Error: {e}")

    print("Backfill complete")

if __name__ == "__main__":
    main()
