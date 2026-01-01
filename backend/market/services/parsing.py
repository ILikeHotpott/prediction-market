from django.utils import timezone
from django.utils.dateparse import parse_datetime


def parse_iso_datetime(value: str):
    if not value:
        return None
    dt = parse_datetime(value)
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


