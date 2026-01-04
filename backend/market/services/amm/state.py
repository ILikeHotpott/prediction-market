from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .errors import QuoteInputError


@dataclass(frozen=True)
class PoolState:
    market_id: str
    pool_id: str
    b: float
    fee_bps: int
    option_ids: List[str]
    option_indexes: List[int]
    q: List[float]
    option_id_to_idx: Dict[str, int]
    option_index_to_idx: Dict[int, int]
    # For exclusive events: maps No option_id -> (Yes option_id, pool_idx)
    no_to_yes_option_id: Dict[str, Tuple[str, int]] = field(default_factory=dict)
    # Whether this pool is for an exclusive event
    is_exclusive: bool = False

    def resolve_target_idx(self, *, option_id: Optional[str], option_index: Optional[int]) -> int:
        return _resolve_target_idx(self, option_id=option_id, option_index=option_index)

    def resolve_with_side(self, *, option_id: Optional[str], option_index: Optional[int]) -> Tuple[int, bool]:
        """
        Returns (pool_idx, is_no_side).
        For exclusive events, if option_id is a No option, maps to the Yes counterpart.
        """
        return _resolve_with_side(self, option_id=option_id, option_index=option_index)


def _resolve_target_idx(
    state: PoolState,
    *,
    option_id: Optional[str],
    option_index: Optional[int],
) -> int:
    if option_id is not None:
        oid = str(option_id)
        if oid in state.option_id_to_idx:
            return state.option_id_to_idx[oid]
        # For exclusive events, check if this is a No option
        if oid in state.no_to_yes_option_id:
            _, pool_idx = state.no_to_yes_option_id[oid]
            return pool_idx
        raise QuoteInputError("target option_id not found in this pool")

    if option_index is not None:
        if option_index in state.option_index_to_idx:
            return state.option_index_to_idx[option_index]
        raise QuoteInputError("target option_index not found in this pool")

    raise QuoteInputError("must provide option_id or option_index")


def _resolve_with_side(
    state: PoolState,
    *,
    option_id: Optional[str],
    option_index: Optional[int],
) -> Tuple[int, bool]:
    """
    Returns (pool_idx, is_no_side).
    For exclusive events, if option_id is a No option, maps to the Yes counterpart.
    """
    if option_id is not None:
        oid = str(option_id)
        if oid in state.option_id_to_idx:
            return state.option_id_to_idx[oid], False
        # For exclusive events, check if this is a No option
        if oid in state.no_to_yes_option_id:
            _, pool_idx = state.no_to_yes_option_id[oid]
            return pool_idx, True
        raise QuoteInputError("target option_id not found in this pool")

    if option_index is not None:
        if option_index in state.option_index_to_idx:
            return state.option_index_to_idx[option_index], False
        raise QuoteInputError("target option_index not found in this pool")

    raise QuoteInputError("must provide option_id or option_index")

