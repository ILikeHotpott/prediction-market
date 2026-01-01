import math
from typing import List, Sequence


def _logsumexp(xs: Sequence[float]) -> float:
    """Stable log(sum(exp(xs)))."""
    m = max(xs)
    if math.isinf(m):
        return m
    s = 0.0
    for x in xs:
        s += math.exp(x - m)
    return m + math.log(s)


def _log1p_exp(x: float) -> float:
    """
    Stable log(1 + exp(x)).
    Useful when x can be very large/small.
    """
    if x > 50.0:
        return x  # log(1+e^x) ~ x
    if x < -50.0:
        return math.exp(x)  # log(1+e^x) ~ e^x
    return math.log1p(math.exp(x))


def prices(q: Sequence[float], b: float) -> List[float]:
    """
    LMSR instantaneous prices:
      p_i = exp(q_i/b) / sum_j exp(q_j/b)

    Returns list of probabilities that sum to 1.
    """
    if b <= 0:
        raise ValueError("b must be > 0")

    # softmax(q/b) with stability
    scaled = [qi / b for qi in q]
    m = max(scaled)
    exps = [math.exp(x - m) for x in scaled]
    s = sum(exps)
    return [e / s for e in exps]


def cost(q: Sequence[float], b: float) -> float:
    """
    LMSR cost function:
      C(q) = b * log( sum_i exp(q_i/b) )
    """
    if b <= 0:
        raise ValueError("b must be > 0")
    scaled = [qi / b for qi in q]
    return b * _logsumexp(scaled)


def buy_amount_to_delta_q(
    q: Sequence[float],
    b: float,
    option_index: int,
    amount_net: float,
) -> float:
    """
    Given current q, liquidity b, and a net spend amount_net (after fee),
    compute delta_q for buying ONLY outcome option_index such that:

      cost(q + delta_q * e_i, b) - cost(q, b) = amount_net

    Closed-form solution:
      Let S = sum_j exp(q_j/b), a = exp(q_i/b)
      k = exp(amount_net/b)
      delta = b * log( 1 + (k-1)*S/a )

    Implemented in a numerically stable way.
    """
    if b <= 0:
        raise ValueError("b must be > 0")
    if amount_net <= 0:
        raise ValueError("amount_net must be > 0")
    if option_index < 0 or option_index >= len(q):
        raise IndexError("option_index out of range")

    # Work in log-domain for stability
    scaled = [qi / b for qi in q]
    logS = _logsumexp(scaled)              # log(sum exp(q/b))
    loga = scaled[option_index]            # log(exp(q_i/b)) = q_i/b
    log_ratio = logS - loga                # log(S/a)

    # t = exp(amount_net/b) - 1, stable via expm1
    t = math.expm1(amount_net / b)         # > 0

    # Need log(1 + t * exp(log_ratio))
    # = log(1 + exp(log(t) + log_ratio))
    x = math.log(t) + log_ratio
    return b * _log1p_exp(x)


if __name__ == "__main__":
    b = 10000.0
    q = [0.0, 0.0]

    p0 = prices(q, b)
    print("init q:", q, "p:", p0)
    assert abs(p0[0] - 0.5) < 1e-12 and abs(p0[1] - 0.5) < 1e-12

    amount_net = 1000.0
    delta = buy_amount_to_delta_q(q, b, option_index=0, amount_net=amount_net)  # buy YES(0)
    q2 = [q[0] + delta, q[1]]

    p1 = prices(q2, b)
    print("after buy yes delta:", delta)
    print("new q:", q2, "p:", p1)

    assert p1[0] > 0.5 and p1[1] < 0.5
    assert abs(sum(p1) - 1.0) < 1e-12

    print("cost diff:", cost(q2, b) - cost(q, b), "should ~= amount_net:", amount_net)