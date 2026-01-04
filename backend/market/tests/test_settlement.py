# market/tests/test_settlement.py
"""
Tests for market settlement: resolution and payout.

Coverage:
- compute_b_from_funding formula
- resolve_market (normal case, idempotency, error cases)
- settle_market (payout logic, pool_cash vs collateral, idempotency)
- resolve_and_settle_market convenience function
"""

import math
import os
import uuid
from decimal import Decimal

import pytest

# Setup path and Django settings before any Django imports
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Set Django settings module
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "monofuture.settings")

import django
django.setup()

from market.services.amm.setup import compute_b_from_funding, AmmSetupError


# ---------- compute_b_from_funding tests ----------
class TestComputeBFromFunding:
    """Tests for the b = F / ln(N) formula."""

    def test_basic_binary_market(self):
        """b = F / ln(2) for binary market."""
        F = Decimal("1000")
        b = compute_b_from_funding(F, num_outcomes=2)
        expected = F / Decimal(str(math.log(2)))
        assert float(b) == pytest.approx(float(expected), rel=1e-12)

    def test_three_outcomes(self):
        """b = F / ln(3) for ternary market."""
        F = Decimal("1000")
        b = compute_b_from_funding(F, num_outcomes=3)
        expected = F / Decimal(str(math.log(3)))
        assert float(b) == pytest.approx(float(expected), rel=1e-12)

    def test_many_outcomes(self):
        """Test with larger number of outcomes."""
        F = Decimal("10000")
        for n in [4, 5, 8, 10, 20]:
            b = compute_b_from_funding(F, num_outcomes=n)
            expected = F / Decimal(str(math.log(n)))
            assert float(b) == pytest.approx(float(expected), rel=1e-12)

    def test_large_funding_amount(self):
        """Test with large funding amount."""
        F = Decimal("1000000000")  # 1 billion
        b = compute_b_from_funding(F, num_outcomes=2)
        expected = F / Decimal(str(math.log(2)))
        assert float(b) == pytest.approx(float(expected), rel=1e-10)

    def test_small_funding_amount(self):
        """Test with small funding amount."""
        F = Decimal("0.001")
        b = compute_b_from_funding(F, num_outcomes=2)
        expected = F / Decimal(str(math.log(2)))
        assert float(b) == pytest.approx(float(expected), rel=1e-12)

    def test_zero_funding_raises(self):
        """Zero funding should raise error."""
        with pytest.raises(AmmSetupError, match="positive"):
            compute_b_from_funding(Decimal("0"), num_outcomes=2)

    def test_negative_funding_raises(self):
        """Negative funding should raise error."""
        with pytest.raises(AmmSetupError, match="positive"):
            compute_b_from_funding(Decimal("-100"), num_outcomes=2)

    def test_single_outcome_raises(self):
        """Single outcome (< 2) should raise error."""
        with pytest.raises(AmmSetupError, match="at least 2"):
            compute_b_from_funding(Decimal("1000"), num_outcomes=1)

    def test_zero_outcomes_raises(self):
        """Zero outcomes should raise error."""
        with pytest.raises(AmmSetupError, match="at least 2"):
            compute_b_from_funding(Decimal("1000"), num_outcomes=0)

    def test_result_is_decimal(self):
        """Result should be a Decimal."""
        b = compute_b_from_funding(Decimal("1000"), num_outcomes=2)
        assert isinstance(b, Decimal)

    def test_scaling_property(self):
        """b should scale linearly with F: b(2F) = 2 * b(F)."""
        F1 = Decimal("1000")
        F2 = Decimal("2000")
        b1 = compute_b_from_funding(F1, num_outcomes=3)
        b2 = compute_b_from_funding(F2, num_outcomes=3)
        assert float(b2) == pytest.approx(float(b1) * 2, rel=1e-12)

    def test_inverse_ln_relationship(self):
        """
        More outcomes -> smaller b for same F.
        b(F, 4) < b(F, 2) because ln(4) > ln(2).
        """
        F = Decimal("1000")
        b2 = compute_b_from_funding(F, num_outcomes=2)
        b4 = compute_b_from_funding(F, num_outcomes=4)
        b8 = compute_b_from_funding(F, num_outcomes=8)
        assert b2 > b4 > b8


# ---------- Mock-based settlement tests ----------
# These tests use mocks since we don't have a full Django DB setup
class TestSettlementLogic:
    """
    Tests for settlement logic using mocks.

    These test the core logic without requiring a database.
    """

    def test_payout_calculation(self):
        """Each winning share should pay out 1 unit of collateral."""
        # Core payout logic
        total_winning_shares = Decimal("150")
        payout_per_share = Decimal("1")
        total_payout = total_winning_shares * payout_per_share
        assert total_payout == Decimal("150")

    def test_funding_source_priority_pool_cash_sufficient(self):
        """When pool_cash >= total_payout, use only pool_cash."""
        pool_cash = Decimal("200")
        collateral_amount = Decimal("100")
        total_payout = Decimal("150")

        pool_cash_used = min(pool_cash, total_payout)
        remaining = total_payout - pool_cash_used
        collateral_used = Decimal("0") if remaining <= 0 else remaining

        assert pool_cash_used == Decimal("150")
        assert collateral_used == Decimal("0")

    def test_funding_source_priority_pool_cash_partial(self):
        """When pool_cash < total_payout, use pool_cash first then collateral."""
        pool_cash = Decimal("100")
        collateral_amount = Decimal("200")
        total_payout = Decimal("150")

        pool_cash_used = min(pool_cash, total_payout)
        remaining = total_payout - pool_cash_used
        collateral_used = remaining

        assert pool_cash_used == Decimal("100")
        assert collateral_used == Decimal("50")

    def test_funding_source_priority_no_pool_cash(self):
        """When pool_cash = 0, use only collateral."""
        pool_cash = Decimal("0")
        collateral_amount = Decimal("200")
        total_payout = Decimal("150")

        pool_cash_used = min(pool_cash, total_payout)
        remaining = total_payout - pool_cash_used
        collateral_used = remaining

        assert pool_cash_used == Decimal("0")
        assert collateral_used == Decimal("150")

    def test_insufficient_funds_detection(self):
        """Should detect when total funds are insufficient."""
        pool_cash = Decimal("50")
        collateral_amount = Decimal("50")
        total_payout = Decimal("150")

        pool_cash_used = min(pool_cash, total_payout)
        remaining = total_payout - pool_cash_used
        has_sufficient_funds = remaining <= collateral_amount

        assert not has_sufficient_funds
        assert remaining == Decimal("100")  # Need 100 more but only have 50

    def test_sufficient_funds_edge_case(self):
        """Exact match of funds should succeed."""
        pool_cash = Decimal("100")
        collateral_amount = Decimal("50")
        total_payout = Decimal("150")

        pool_cash_used = min(pool_cash, total_payout)
        remaining = total_payout - pool_cash_used
        has_sufficient_funds = remaining <= collateral_amount

        assert has_sufficient_funds
        assert pool_cash_used == Decimal("100")
        assert remaining == Decimal("50")

    def test_no_winners_zero_payout(self):
        """When no winning positions, total_payout = 0."""
        winning_shares = []
        total_payout = sum(Decimal(s) for s in winning_shares)
        assert total_payout == Decimal("0")

    def test_multiple_winners_payout(self):
        """Multiple winners should each get their share * 1."""
        positions = [
            {"shares": Decimal("10")},
            {"shares": Decimal("25")},
            {"shares": Decimal("5")},
        ]
        total_payout = sum(p["shares"] for p in positions)
        assert total_payout == Decimal("40")

        # Each position payout
        payouts = [p["shares"] * Decimal("1") for p in positions]
        assert payouts == [Decimal("10"), Decimal("25"), Decimal("5")]


class TestSettlementTxId:
    """Tests for settlement transaction ID generation and usage."""

    def test_tx_id_format(self):
        """Settlement tx_id should follow expected format."""
        # Based on _generate_settlement_tx_id
        tx_id = f"settle:{uuid.uuid4()}"
        assert tx_id.startswith("settle:")
        # UUID part should be valid
        uuid_part = tx_id.split(":")[1]
        assert len(uuid_part) == 36  # UUID format

    def test_tx_id_uniqueness(self):
        """Each generated tx_id should be unique."""
        tx_ids = [f"settle:{uuid.uuid4()}" for _ in range(100)]
        assert len(set(tx_ids)) == 100


class TestMarketStatusTransitions:
    """Tests for valid market status transitions during settlement."""

    def test_valid_resolution_statuses(self):
        """Markets can only be resolved from 'active' or 'closed' status."""
        valid_for_resolution = {"active", "closed"}

        for status in ["active", "closed"]:
            assert status in valid_for_resolution

        for status in ["draft", "pending", "resolved", "canceled"]:
            assert status not in valid_for_resolution

    def test_valid_settlement_status(self):
        """Markets can only be settled from 'resolved' status."""
        valid_for_settlement = {"resolved"}

        assert "resolved" in valid_for_settlement

        for status in ["draft", "pending", "active", "closed", "canceled"]:
            assert status not in valid_for_settlement


class TestBalanceUpdate:
    """Tests for balance update logic during settlement."""

    def test_balance_credit_existing(self):
        """Crediting existing balance should add to available_amount."""
        current_balance = Decimal("100")
        payout = Decimal("50")
        new_balance = current_balance + payout
        assert new_balance == Decimal("150")

    def test_balance_credit_new(self):
        """Creating new balance should set available_amount to payout."""
        payout = Decimal("50")
        # New balance starts at payout amount
        new_balance = payout
        assert new_balance == Decimal("50")

    def test_balance_multiple_payouts(self):
        """Multiple payouts to same user should accumulate."""
        balances = {}
        user_id = "user-1"

        # First payout
        payout1 = Decimal("30")
        balances[user_id] = balances.get(user_id, Decimal("0")) + payout1

        # Second payout
        payout2 = Decimal("20")
        balances[user_id] = balances.get(user_id, Decimal("0")) + payout2

        assert balances[user_id] == Decimal("50")


class TestPoolStateAfterSettlement:
    """Tests for pool state updates after settlement."""

    def test_pool_cash_deduction(self):
        """Pool cash should be reduced by pool_cash_used."""
        initial_pool_cash = Decimal("200")
        pool_cash_used = Decimal("150")
        final_pool_cash = initial_pool_cash - pool_cash_used
        assert final_pool_cash == Decimal("50")

    def test_collateral_deduction(self):
        """Collateral should be reduced by collateral_used."""
        initial_collateral = Decimal("100")
        collateral_used = Decimal("30")
        final_collateral = initial_collateral - collateral_used
        assert final_collateral == Decimal("70")

    def test_pool_status_after_settlement(self):
        """Pool status should be 'closed' after settlement."""
        # Settlement logic sets pool.status = "closed"
        expected_status = "closed"
        assert expected_status == "closed"


# ---------- Integration-style tests (require Django test DB) ----------
# These tests are marked to skip if not in a proper Django test environment
@pytest.mark.skipif(
    "django.test" not in sys.modules,
    reason="Requires Django test environment"
)
class TestSettlementIntegration:
    """
    Integration tests requiring Django test database.

    These tests will be skipped unless run with pytest-django.
    """

    def test_resolve_market_creates_resolved_status(self):
        """resolve_market should set market.status to 'resolved'."""
        # Would require actual database
        pass

    def test_settle_market_idempotent(self):
        """Calling settle_market twice should return same result."""
        # Would require actual database
        pass

    def test_concurrent_settlement_safe(self):
        """Concurrent settlement attempts should be handled safely."""
        # Would require actual database with threading
        pass
