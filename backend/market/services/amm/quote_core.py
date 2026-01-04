from __future__ import annotations

import math
from decimal import Decimal, ROUND_DOWN, ROUND_UP
from typing import Dict, List, Optional, Tuple

from .errors import QuoteInputError, QuoteMathError
from .lmsr import buy_amount_to_delta_q, cost, prices
from .money import (
    Number,
    _bps_from_probabilities,
    _fee_rate_from_bps,
    _finite_pos_float,
    _quantize_money,
    _quantize_shares,
    _to_decimal,
)
from .quote_math import _max_gross_payout, _solve_sell_shares_for_gross_payout
from .state import PoolState, _resolve_target_idx


def _compute_no_buy_deltas(
    state: PoolState,
    target_idx: int,
    net_float: float,
) -> Tuple[List[float], float]:
    """
    For buying "No" on option target_idx in an exclusive event:
    Distribute the buy across all OTHER options proportionally to their probabilities.
    
    Returns (deltas, total_shares) where:
      - deltas[j] is the q increase for option j (0 for target_idx)
      - total_shares is the sum of shares bought (used for No share calculation)
    """
    n = len(state.q)
    if n < 2:
        raise QuoteMathError("Cannot buy No in a single-option pool")
    
    # Get current probabilities
    probs = prices(state.q, state.b)
    
    # Calculate the sum of probabilities for all options except target
    other_prob_sum = sum(probs[j] for j in range(n) if j != target_idx)
    if other_prob_sum <= 0:
        raise QuoteMathError("No other options available to distribute buy")
    
    # Distribute the amount proportionally to probabilities of other options
    # Each other option j gets: amount * (p_j / sum_of_other_probs)
    deltas = [0.0] * n
    total_shares = 0.0
    
    for j in range(n):
        if j == target_idx:
            continue
        # Proportion of the amount going to option j
        amount_j = net_float * (probs[j] / other_prob_sum)
        if amount_j > 0:
            delta_j = float(buy_amount_to_delta_q(state.q, state.b, j, amount_j))
            deltas[j] = delta_j
            total_shares += delta_j
    
    return deltas, total_shares


def quote_from_state(
    state: PoolState,
    *,
    option_id: Optional[str] = None,
    option_index: Optional[int] = None,
    side: str = "buy",
    amount_in: Optional[Number] = None,
    shares: Optional[Number] = None,
    money_quant: Decimal = Decimal("0.01"),
    is_no_side: bool = False,  # True if this is a No option in an exclusive event
) -> Dict:
    """
    Pure function quote:
      - NO database access
      - Deterministic rounding:
          buy money: ROUND_UP (user pays)
          sell money: ROUND_DOWN (user receives)

    Exactly one of (amount_in, shares) must be provided.

    Semantics:
      BUY:
        - amount_in provided: fee taken from amount_in, net goes to AMM -> shares_out
        - shares provided: compute net_cost, gross-up with fee -> amount_in

      SELL:
        - shares provided: compute gross proceeds, fee taken -> amount_out (net)
        - amount_in provided: interpret as desired NET amount_out, gross-up -> solve shares_in
        
      For exclusive events with is_no_side=True:
        - BUY NO: distribute buy across all OTHER options, user gets No shares
    """
    side = (side or "").lower()
    if side not in {"buy", "sell"}:
        raise QuoteInputError("side must be 'buy' or 'sell'")

    if (amount_in is None and shares is None) or (amount_in is not None and shares is not None):
        raise QuoteInputError("provide exactly one of amount_in or shares")

    fee_rate = _fee_rate_from_bps(state.fee_bps)  # Decimal
    one_minus_fee = (Decimal("1") - fee_rate)

    target_idx = _resolve_target_idx(state, option_id=option_id, option_index=option_index)

    pre_probs = prices(state.q, state.b)
    pre_prob_bps = _bps_from_probabilities(pre_probs)
    p_k = float(pre_probs[target_idx])

    def post_prob_bps_for(q_post):
        return _bps_from_probabilities(prices(q_post, state.b))

    # ---------------- BUY ----------------
    if side == "buy":
        if amount_in is not None:
            gross_in_dec = _to_decimal(amount_in, "amount_in")
            if gross_in_dec <= 0:
                raise QuoteInputError("amount_in must be > 0")

            # fee & net with explicit rounding (system-favorable)
            fee_dec = _quantize_money(gross_in_dec * fee_rate, money_quant, ROUND_UP)
            net_dec = gross_in_dec - fee_dec
            if net_dec <= 0:
                raise QuoteMathError("Amount too low to cover fees")

            net_float = _finite_pos_float(net_dec, "amount_net")

            if is_no_side and state.is_exclusive:
                # BUY NO: distribute buy across all OTHER options
                deltas, total_shares = _compute_no_buy_deltas(state, target_idx, net_float)
                if total_shares <= 0:
                    raise QuoteMathError("Amount too low to produce any shares (after fees / rounding)")

                q_post = list(state.q)
                for j, d in enumerate(deltas):
                    q_post[j] += d
                post_prob_bps = post_prob_bps_for(q_post)

                # avg price for No shares: total amount / total shares
                shares_out_dec = _quantize_shares(total_shares)
                avg_price_bps = int(round(float(gross_in_dec) / float(shares_out_dec) * 10000.0))

                return {
                    "market_id": state.market_id,
                    "pool_id": state.pool_id,
                    "option_id": state.option_ids[target_idx],  # The Yes option corresponding to this No
                    "side": "buy",
                    "is_no_side": True,
                    "amount_in": str(_quantize_money(gross_in_dec, money_quant, ROUND_UP)),
                    "shares_out": str(shares_out_dec),
                    "fee_amount": str(fee_dec),
                    "avg_price_bps": avg_price_bps,
                    "pre_prob_bps": pre_prob_bps,
                    "post_prob_bps": post_prob_bps,
                    "option_ids": state.option_ids,
                    "option_indexes": state.option_indexes,
                    "no_buy_deltas": deltas,  # For execution to know how to update each q
                }

            # Standard BUY YES
            delta = float(buy_amount_to_delta_q(state.q, state.b, target_idx, net_float))
            if not (math.isfinite(delta) and delta > 0.0):
                raise QuoteMathError("Amount too low to produce any shares (after fees / rounding)")

            q_post = list(state.q)
            q_post[target_idx] += delta
            post_prob_bps = post_prob_bps_for(q_post)

            # avg price uses gross user paid (rounded) / shares
            shares_out_dec = _quantize_shares(delta)
            avg_price_bps = int(round(float(gross_in_dec) / float(shares_out_dec) * 10000.0))

            return {
                "market_id": state.market_id,
                "pool_id": state.pool_id,
                "option_id": state.option_ids[target_idx],
                "side": "buy",
                "amount_in": str(_quantize_money(gross_in_dec, money_quant, ROUND_UP)),
                "shares_out": str(shares_out_dec),
                "fee_amount": str(fee_dec),
                "avg_price_bps": avg_price_bps,
                "pre_prob_bps": pre_prob_bps,
                "post_prob_bps": post_prob_bps,
                "option_ids": state.option_ids,
                "option_indexes": state.option_indexes,
            }

        # buy with shares
        shares_dec = _to_decimal(shares, "shares")
        if shares_dec <= 0:
            raise QuoteInputError("shares must be > 0")
        shares_float = _finite_pos_float(shares_dec, "shares")

        q_post = list(state.q)
        q_post[target_idx] += shares_float

        net_cost_float = float(cost(q_post, state.b) - cost(state.q, state.b))
        if not (math.isfinite(net_cost_float) and net_cost_float > 0.0):
            raise QuoteMathError("invalid net cost for buy(shares)")

        net_cost_dec = _quantize_money(Decimal(str(net_cost_float)), money_quant, ROUND_UP)
        if one_minus_fee <= 0:
            raise QuoteInputError("fee too high")

        gross_in_dec = _quantize_money(net_cost_dec / one_minus_fee, money_quant, ROUND_UP)
        fee_dec = gross_in_dec - net_cost_dec

        post_prob_bps = post_prob_bps_for(q_post)
        avg_price_bps = int(round(float(gross_in_dec) / shares_float * 10000.0))

        return {
            "market_id": state.market_id,
            "pool_id": state.pool_id,
            "option_id": state.option_ids[target_idx],
            "side": "buy",
            "amount_in": str(gross_in_dec),
            "shares_out": str(shares_dec),
            "fee_amount": str(fee_dec),
            "avg_price_bps": avg_price_bps,
            "pre_prob_bps": pre_prob_bps,
            "post_prob_bps": post_prob_bps,
            "option_ids": state.option_ids,
            "option_indexes": state.option_indexes,
        }

    # ---------------- SELL ----------------
    if shares is not None:
        shares_dec = _to_decimal(shares, "shares")
        if shares_dec <= 0:
            raise QuoteInputError("shares must be > 0")
        shares_float = _finite_pos_float(shares_dec, "shares")

        if is_no_side and state.is_exclusive:
            # SELL NO: reduce q for all OTHER options (reverse of buy No)
            n = len(state.q)
            probs = prices(state.q, state.b)
            other_prob_sum = sum(probs[j] for j in range(n) if j != target_idx)
            if other_prob_sum <= 0:
                raise QuoteMathError("No other options available for No sell")

            # Distribute the shares reduction proportionally
            deltas = [0.0] * n
            for j in range(n):
                if j == target_idx:
                    continue
                share_j = shares_float * (probs[j] / other_prob_sum)
                deltas[j] = -share_j  # negative because we're reducing

            q_post = list(state.q)
            for j, d in enumerate(deltas):
                q_post[j] += d

            gross_float = float(cost(state.q, state.b) - cost(q_post, state.b))
            if not (math.isfinite(gross_float) and gross_float > 0.0):
                raise QuoteMathError("invalid gross proceeds for sell No(shares)")

            gross_dec = _quantize_money(Decimal(str(gross_float)), money_quant, ROUND_DOWN)
            fee_dec = _quantize_money(gross_dec * fee_rate, money_quant, ROUND_UP)
            net_out_dec = _quantize_money(gross_dec - fee_dec, money_quant, ROUND_DOWN)

            if net_out_dec <= 0:
                raise QuoteMathError("Proceeds too low after fees / rounding")

            post_prob_bps = post_prob_bps_for(q_post)
            avg_price_bps = int(round(float(net_out_dec) / shares_float * 10000.0))

            return {
                "market_id": state.market_id,
                "pool_id": state.pool_id,
                "option_id": state.option_ids[target_idx],
                "side": "sell",
                "is_no_side": True,
                "amount_out": str(net_out_dec),
                "shares_in": str(shares_dec),
                "fee_amount": str(fee_dec),
                "avg_price_bps": avg_price_bps,
                "pre_prob_bps": pre_prob_bps,
                "post_prob_bps": post_prob_bps,
                "option_ids": state.option_ids,
                "option_indexes": state.option_indexes,
                "no_sell_deltas": deltas,
            }

        # Standard SELL YES
        q_post = list(state.q)
        q_post[target_idx] -= shares_float

        gross_float = float(cost(state.q, state.b) - cost(q_post, state.b))
        if not (math.isfinite(gross_float) and gross_float > 0.0):
            raise QuoteMathError("invalid gross proceeds for sell(shares)")

        gross_dec = _quantize_money(Decimal(str(gross_float)), money_quant, ROUND_DOWN)
        fee_dec = _quantize_money(gross_dec * fee_rate, money_quant, ROUND_UP)
        net_out_dec = _quantize_money(gross_dec - fee_dec, money_quant, ROUND_DOWN)

        if net_out_dec <= 0:
            raise QuoteMathError("Proceeds too low after fees / rounding")

        post_prob_bps = post_prob_bps_for(q_post)
        avg_price_bps = int(round(float(net_out_dec) / shares_float * 10000.0))

        return {
            "market_id": state.market_id,
            "pool_id": state.pool_id,
            "option_id": state.option_ids[target_idx],
            "side": "sell",
            "amount_out": str(net_out_dec),
            "shares_in": str(shares_dec),
            "fee_amount": str(fee_dec),
            "avg_price_bps": avg_price_bps,
            "pre_prob_bps": pre_prob_bps,
            "post_prob_bps": post_prob_bps,
            "option_ids": state.option_ids,
            "option_indexes": state.option_indexes,
        }

    desired_net_out_dec = _to_decimal(amount_in, "amount_in")
    if desired_net_out_dec <= 0:
        raise QuoteInputError("amount_in (desired amount_out) must be > 0")

    desired_net_out_dec = _quantize_money(desired_net_out_dec, money_quant, ROUND_DOWN)

    if one_minus_fee <= 0:
        raise QuoteInputError("fee too high")

    gross_needed_dec = _quantize_money(desired_net_out_dec / one_minus_fee, money_quant, ROUND_UP)
    gross_needed_float = float(gross_needed_dec)

    max_gross = _max_gross_payout(p_k, state.b)
    if gross_needed_float >= max_gross:
        max_net = Decimal(str(max_gross)) * one_minus_fee
        raise QuoteMathError(
            f"desired amount_out too large (max net≈{_quantize_money(max_net, money_quant, ROUND_DOWN)})"
        )

    shares_needed = _solve_sell_shares_for_gross_payout(p_k, state.b, gross_needed_float)
    if not (math.isfinite(shares_needed) and shares_needed > 0.0):
        raise QuoteMathError("invalid shares_in solved for sell(amount_out)")

    shares_needed_dec = _quantize_shares(shares_needed)
    q_post = list(state.q)
    q_post[target_idx] -= float(shares_needed_dec)

    gross_float = float(cost(state.q, state.b) - cost(q_post, state.b))
    gross_dec = _quantize_money(Decimal(str(gross_float)), money_quant, ROUND_DOWN)
    fee_dec = _quantize_money(gross_dec * fee_rate, money_quant, ROUND_UP)
    net_out_dec = _quantize_money(gross_dec - fee_dec, money_quant, ROUND_DOWN)

    post_prob_bps = post_prob_bps_for(q_post)
    avg_price_bps = int(round(float(net_out_dec) / float(shares_needed_dec) * 10000.0))

    return {
        "market_id": state.market_id,
        "pool_id": state.pool_id,
        "option_id": state.option_ids[target_idx],
        "side": "sell",
        "amount_out": str(net_out_dec),
        "shares_in": str(shares_needed_dec),
        "fee_amount": str(fee_dec),
        "avg_price_bps": avg_price_bps,
        "pre_prob_bps": pre_prob_bps,
        "post_prob_bps": post_prob_bps,
        "option_ids": state.option_ids,
        "option_indexes": state.option_indexes,
        "requested_amount_out": str(desired_net_out_dec),
        "gross_needed": str(gross_needed_dec),
    }

