"""
Deprecated compatibility imports. Prefer using helpers in `market.services`.
"""

from ..services.auth import get_user_from_request as _get_user_from_request
from ..services.auth import require_admin as _require_admin
from ..services.parsing import parse_iso_datetime as _parse_datetime
from ..services.serializers import (
    serialize_event as _serialize_event,
    serialize_market as _serialize_market,
    serialize_option as _serialize_option,
)

