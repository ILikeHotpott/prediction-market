from django.urls import path

from . import views

urlpatterns = [
    path("api/markets/", views.list_markets, name="market-list"),
    path("api/markets/create/", views.create_market, name="market-create"),
    path("api/markets/<uuid:market_id>/", views.get_market, name="market-detail"),
    path(
        "api/markets/<uuid:market_id>/publish/",
        views.publish_market,
        name="market-publish",
    ),
    path(
        "api/markets/<uuid:market_id>/status/",
        views.update_market_status,
        name="market-status",
    ),
    path("api/users/sync/", views.sync_user, name="user-sync"),
    path("api/users/me/", views.me, name="user-me"),
]

