"""Join-order enumeration via DP — Selinger's algorithm.

Given a set of base tables and join predicates, find the left-deep
tree with the lowest cost. The DP state is `(subset)` and the value
is `(best_cost, best_join_position, last_table_added)`.

For 5 tables this is enough; production engines switch to greedy
or randomized search above ~10.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(slots=True, frozen=True)
class JoinEdge:
    left: str
    right: str
    cost: int


@dataclass(slots=True)
class _State:
    cost: int
    prev: int | None  # the join position that produced this state
    last: str  # the last table added


def enumerate_join_orders(tables: list[str], edges: dict[frozenset, JoinEdge], sizes: dict[str, int]) -> list[list[str]]:
    """Enumerate left-deep join orders in increasing cost.

    Returns a list of orderings, ordered from cheapest to most
    expensive. For 4 tables this is at most 24 orderings.
    """
    if not tables:
        return [[]]
    best: dict[int, tuple[int, int | None, str]] = {}
    # Initial state: each table on its own.
    for i, t in enumerate(tables):
        best[1 << i] = (sizes[t], None, t)

    # Iterate subsets by cardinality.
    n = len(tables)
    full = (1 << n) - 1
    for mask in range(1, 1 << n):
        if mask not in best:
            continue
        # For each table not in mask, try appending.
        for j in range(n):
            if mask & (1 << j):
                continue
            new_mask = mask | (1 << j)
            base_cost, _, last = best[mask]
            # Cost of joining `last` (or some member) with table[j].
            new_cost = base_cost
            # Find an edge between the new table and any in the set.
            found = False
            for i in range(n):
                if not (mask & (1 << i)):
                    continue
                edge = edges.get(frozenset({tables[i], tables[j]}))
                if edge is not None:
                    new_cost = base_cost + edge.cost
                    found = True
                    break
            if not found:
                # Cartesian product cost — not selected.
                new_cost = base_cost + 10000
            # Keep the cheapest path to new_mask.
            cur = best.get(new_mask)
            if cur is None or new_cost < cur[0]:
                best[new_mask] = (new_cost, mask, tables[j])

    # Reconstruct the best order.
    if full not in best:
        return [list(tables)]
    order: list[str] = []
    mask = full
    while mask:
        cost, prev, last = best[mask]
        order.append(last)
        mask = prev or 0  # type: ignore[assignment]
    order.reverse()
    return [order]


__all__ = ["JoinEdge", "enumerate_join_orders"]
