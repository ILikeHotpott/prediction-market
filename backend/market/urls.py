from django.urls import path

from .views import comments, events, market, orders, users

urlpatterns = [
    # Event-first APIs
    path("api/events/", events.list_events, name="event-list"),
    path("api/events/create/", events.create_event, name="event-create"),
    path("api/events/<uuid:event_id>/", events.get_event, name="event-detail"),
    path(
        "api/events/<uuid:event_id>/publish/",
        events.publish_event,
        name="event-publish",
    ),
    path(
        "api/events/<uuid:event_id>/status/",
        events.update_event_status,
        name="event-status",
    ),

    # Legacy market endpoints (kept for backward compatibility)
    path("api/markets/", market.list_markets, name="market-list"),
    path("api/markets/create/", market.create_market, name="market-create"),
    path("api/markets/<uuid:market_id>/", market.get_market, name="market-detail"),
    path(
        "api/markets/<uuid:market_id>/publish/",
        market.publish_market,
        name="market-publish",
    ),
    path(
        "api/markets/<uuid:market_id>/status/",
        market.update_market_status,
        name="market-status",
    ),
    path(
        "api/markets/<uuid:market_id>/orders/",
        orders.place_order,
        name="market-order",
    ),
    path(
        "api/markets/<uuid:market_id>/orders/buy/",
        orders.place_buy_order,
        name="market-order-buy",
    ),
    path(
        "api/markets/<uuid:market_id>/orders/sell/",
        orders.place_sell_order,
        name="market-order-sell",
    ),
    path(
        "api/markets/<uuid:market_id>/comments/",
        comments.market_comments,
        name="market-comments",
    ),
    path("api/users/sync/", users.sync_user, name="user-sync"),
    path("api/users/me/", users.me, name="user-me"),
    path("api/users/me/balance/", users.get_balance, name="user-balance"),
    path("api/users/me/portfolio/", users.portfolio, name="user-portfolio"),
    path("api/users/me/history/", users.order_history, name="user-history"),
]

