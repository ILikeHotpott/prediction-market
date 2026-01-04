from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/series/(?P<event_id>[0-9a-f-]+)/$", consumers.SeriesConsumer.as_asgi()),
]
