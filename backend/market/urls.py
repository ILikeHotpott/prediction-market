from django.urls import path
from django.http import JsonResponse

from .views import admin, amm, comments, events, finance, market, orders, redemption, search, series, stripe_payments, tags, translations, upload, users, watchlist


def health_check(request):
    return JsonResponse({"status": "healthy"})


urlpatterns = [
    # Health check
    path("api/health/", health_check, name="health-check"),

    # Translation API
    path("api/translate/", translations.translate, name="translate"),

    # Search API
    path("api/search/", search.search, name="search"),
    path("api/search/reindex/", search.reindex_events, name="search-reindex"),

    # Upload API
    path("api/upload/image/", upload.upload_image, name="upload-image"),

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
    path(
        "api/events/<uuid:event_id>/update/",
        events.update_event,
        name="event-update",
    ),

    # Watchlist APIs
    path("api/watchlist/", watchlist.list_watchlist, name="watchlist-list"),
    path("api/watchlist/<uuid:event_id>/toggle/", watchlist.toggle_watchlist, name="watchlist-toggle"),

    # Legacy market endpoints (kept for backward compatibility)
    path("api/markets/", market.list_markets, name="market-list"),
    path("api/markets/create/", market.create_market, name="market-create"),
    path("api/markets/series/", series.get_series, name="market-series"),
    path("api/markets/series/delta/", series.get_series_delta, name="market-series-delta"),  # A2: incremental fetch
    path("api/finance/series/", finance.finance_series, name="finance-series"),
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
        "api/markets/<uuid:market_id>/quote/",
        amm.quote,
        name="market-quote",
    ),
    path(
        "api/markets/<uuid:market_id>/comments/",
        comments.market_comments,
        name="market-comments",
    ),
    path("api/users/sync/", users.sync_user, name="user-sync"),
    path("api/users/me/", users.me, name="user-me"),
    path("api/users/me/profile/", users.update_profile, name="user-profile-update"),
    path("api/users/me/avatar/", users.upload_avatar, name="user-avatar-upload"),
    path("api/users/me/balance/", users.get_balance, name="user-balance"),
    path("api/users/me/portfolio/", users.portfolio, name="user-portfolio"),
    path("api/users/me/history/", users.order_history, name="user-history"),
    path("api/users/me/pnl-history/", users.pnl_history, name="user-pnl-history"),
    path("api/users/me/onboarding/complete/", users.complete_onboarding, name="user-onboarding-complete"),
    path("api/leaderboard/", users.leaderboard, name="leaderboard"),

    # Admin endpoints for market resolution and settlement
    path(
        "api/admin/markets/<uuid:market_id>/resolve/",
        admin.admin_resolve_market,
        name="admin-market-resolve",
    ),
    path(
        "api/admin/markets/<uuid:market_id>/settle/",
        admin.admin_settle_market,
        name="admin-market-settle",
    ),
    path(
        "api/admin/markets/<uuid:market_id>/resolve-and-settle/",
        admin.admin_resolve_and_settle_market,
        name="admin-market-resolve-and-settle",
    ),
    # Admin pool management
    path(
        "api/admin/events/<uuid:event_id>/pool/",
        admin.admin_get_pool_info,
        name="admin-pool-info",
    ),
    path(
        "api/admin/events/<uuid:event_id>/pool/add-collateral/",
        admin.admin_add_collateral,
        name="admin-add-collateral",
    ),
    # Redemption code endpoints
    path(
        "api/admin/redemption-codes/generate/",
        redemption.generate_code,
        name="admin-generate-code",
    ),
    path(
        "api/admin/redemption-codes/",
        redemption.list_codes,
        name="admin-list-codes",
    ),
    path(
        "api/users/me/redeem/",
        redemption.redeem_code,
        name="user-redeem-code",
    ),
    # Stripe deposit endpoints
    path("api/stripe/packages/", stripe_payments.list_packages, name="stripe-packages"),
    path(
        "api/users/me/stripe/checkout-session/",
        stripe_payments.create_checkout_session,
        name="stripe-checkout-session",
    ),
    path(
        "api/users/me/stripe/confirm/",
        stripe_payments.confirm_checkout_session,
        name="stripe-confirm-session",
    ),
    path("api/stripe/webhook/", stripe_payments.webhook, name="stripe-webhook"),
    # Tags management
    path("api/tags/", tags.list_tags, name="tags-list"),
    path("api/admin/tags/create/", tags.create_tag, name="admin-tags-create"),
    path("api/admin/tags/<uuid:tag_id>/", tags.update_tag, name="admin-tags-update"),
    path("api/admin/tags/<uuid:tag_id>/delete/", tags.delete_tag, name="admin-tags-delete"),
    # User management (superadmin only)
    path("api/admin/users/", admin.admin_list_users, name="admin-users-list"),
    path("api/admin/users/<uuid:user_id>/role/", admin.admin_update_user_role, name="admin-users-role"),
]
