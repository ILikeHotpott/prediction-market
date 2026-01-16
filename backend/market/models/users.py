import uuid

from django.db import models
from django.utils import timezone


class UserRole:
    USER = "user"
    ADMIN = "admin"
    SUPERADMIN = "superadmin"

    ADMIN_ROLES = (ADMIN, SUPERADMIN)
    ALL_ROLES = (USER, ADMIN, SUPERADMIN)


class User(models.Model):
    id = models.UUIDField(primary_key=True)
    display_name = models.TextField(unique=True, default="", blank=True)
    avatar_url = models.TextField(null=True, blank=True)
    role = models.TextField(default="user")
    updated_at = models.DateTimeField(default=timezone.now)
    deleted_at = models.DateTimeField(null=True, blank=True)
    primary_wallet = models.ForeignKey(
        "market.Wallet",
        db_column="primary_wallet_id",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        related_name="primary_users",
    )
    email = models.TextField(unique=True, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    onboarding_completed = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = "users"

    def __str__(self) -> str:
        return self.display_name or str(self.id)


class Wallet(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField(default=timezone.now)
    user = models.ForeignKey(
        User, db_column="user_id", on_delete=models.DO_NOTHING, related_name="wallets"
    )
    chain_family = models.TextField(default="evm")
    address = models.TextField()
    is_primary = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = "wallets"

    def __str__(self) -> str:
        return f"{self.chain_family}:{self.address}"


class WalletAccount(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        db_column="user_id",
        on_delete=models.DO_NOTHING,
        related_name="wallet_accounts",
    )
    provider = models.TextField(default="magic")
    provider_user_id = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "wallet_accounts"


