from django.contrib import admin

from .models import (
    AmmPool,
    AmmPoolOptionState,
    Event,
    Market,
    MarketOption,
    MarketOptionStats,
    MarketSettlement,
    Position,
    Trade,
    User,
)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("id", "display_name", "email", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("display_name", "email")
    readonly_fields = ("id", "created_at")


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "status", "group_rule", "trading_deadline", "created_at")
    list_filter = ("status", "group_rule")
    search_fields = ("title", "slug")
    readonly_fields = ("id", "created_at", "updated_at")
    date_hierarchy = "created_at"


@admin.register(Market)
class MarketAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "status",
        "trading_deadline",
        "resolved_at",
        "settled_at",
        "created_at",
    )
    list_filter = ("status", "market_kind")
    search_fields = ("title", "slug")
    readonly_fields = ("id", "created_at", "updated_at", "resolved_at", "settled_at")
    date_hierarchy = "created_at"
    raw_id_fields = ("event", "created_by")


@admin.register(MarketOption)
class MarketOptionAdmin(admin.ModelAdmin):
    list_display = ("id", "market", "option_index", "title", "side", "is_active")
    list_filter = ("is_active", "side")
    search_fields = ("title",)
    raw_id_fields = ("market",)


@admin.register(MarketOptionStats)
class MarketOptionStatsAdmin(admin.ModelAdmin):
    list_display = ("option", "market", "prob_bps", "volume_total", "last_trade_at")
    raw_id_fields = ("option", "market")


@admin.register(AmmPool)
class AmmPoolAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "market",
        "event",
        "model",
        "status",
        "b",
        "fee_bps",
        "collateral_amount",
        "pool_cash",
        "created_at",
    )
    list_filter = ("status", "model")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("market", "event", "created_by", "fee_recipient_user")


@admin.register(AmmPoolOptionState)
class AmmPoolOptionStateAdmin(admin.ModelAdmin):
    list_display = ("pool", "option", "q", "updated_at")
    raw_id_fields = ("pool", "option")


@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "market", "option", "shares", "cost_basis", "updated_at")
    list_filter = ("market",)
    raw_id_fields = ("user", "market", "option")


@admin.register(Trade)
class TradeAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "market",
        "option",
        "user",
        "side",
        "amount_in",
        "shares",
        "price_bps",
        "block_time",
    )
    list_filter = ("side", "chain")
    raw_id_fields = ("market", "option", "user", "wallet")
    date_hierarchy = "block_time"


@admin.register(MarketSettlement)
class MarketSettlementAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "market",
        "resolved_option",
        "total_payout",
        "pool_cash_used",
        "collateral_used",
        "settled_at",
    )
    readonly_fields = (
        "id",
        "market",
        "resolved_option",
        "total_payout",
        "pool_cash_used",
        "collateral_used",
        "settled_by",
        "settled_at",
        "settlement_tx_id",
    )
    raw_id_fields = ("market", "resolved_option", "settled_by")
    date_hierarchy = "settled_at"
