import json
from decimal import Decimal, InvalidOperation

from django.http import JsonResponse


def parse_json_body(request):
    try:
        return json.loads(request.body.decode() or "{}")
    except json.JSONDecodeError:
        return None


def require_positive_decimal(raw_value, field_name):
    """
    Convert a payload value to Decimal and ensure > 0. Return (value, error_response).
    """
    try:
        value = Decimal(str(raw_value))
    except (InvalidOperation, TypeError):
        return None, JsonResponse({"error": f"{field_name} must be a decimal number"}, status=400)
    if value <= 0:
        return None, JsonResponse({"error": f"{field_name} must be greater than 0"}, status=400)
    return value, None


def parse_buy_payload(payload):
    amount_in, error = require_positive_decimal(payload.get("amount_in"), "amount_in")
    if error:
        return None, error

    min_shares_out_raw = payload.get("min_shares_out")
    max_slippage_bps_raw = payload.get("max_slippage_bps")

    min_shares_out = None
    if min_shares_out_raw is not None:
        min_shares_out, err = require_positive_decimal(min_shares_out_raw, "min_shares_out")
        if err:
            return None, err

    max_slippage_bps = None
    if max_slippage_bps_raw is not None:
        try:
            max_slippage_bps = int(max_slippage_bps_raw)
        except (TypeError, ValueError):
            return None, JsonResponse({"error": "max_slippage_bps must be an integer"}, status=400)
        if max_slippage_bps < 0:
            return None, JsonResponse({"error": "max_slippage_bps must be >= 0"}, status=400)

    return {
        "amount_in": amount_in,
        "token": payload.get("token") or "USDC",
        "option_id": payload.get("option_id"),
        "option_index": payload.get("option_index"),
        "wallet_id": payload.get("wallet_id"),
        "client_nonce": payload.get("client_nonce"),
        "min_shares_out": min_shares_out,
        "max_slippage_bps": max_slippage_bps,
    }, None


def parse_sell_payload(payload):
    shares_raw = payload.get("shares")
    amount_out_raw = payload.get("amount_out")  # desired net proceeds (optional)
    min_amount_out_raw = payload.get("min_amount_out")  # slippage floor (optional)
    sell_all = payload.get("sell_all", False)  # sell all shares (handles dust)

    shares = None
    amount_out = None
    min_amount_out = None
    if shares_raw is not None:
        shares, err = require_positive_decimal(shares_raw, "shares")
        if err:
            return None, err
    if amount_out_raw is not None:
        amount_out, err = require_positive_decimal(amount_out_raw, "amount_out")
        if err:
            return None, err
    if min_amount_out_raw is not None:
        min_amount_out, err = require_positive_decimal(min_amount_out_raw, "min_amount_out")
        if err:
            return None, err

    if not sell_all and shares is None and amount_out is None:
        return None, JsonResponse({"error": "shares, amount_out, or sell_all is required"}, status=400)

    return {
        "shares": shares,
        "amount_out": amount_out,
        "sell_all": bool(sell_all),
        "token": payload.get("token") or "USDC",
        "option_id": payload.get("option_id"),
        "option_index": payload.get("option_index"),
        "wallet_id": payload.get("wallet_id"),
        "client_nonce": payload.get("client_nonce"),
        "min_amount_out": min_amount_out,
    }, None
