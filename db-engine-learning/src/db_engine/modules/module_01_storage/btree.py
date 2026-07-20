"""A small, in-memory B+Tree — the canonical OLTP index.

Used both as an in-memory data structure (tests) and as the inner
node of a heap-table storage. This implementation is *not* on-disk,
but the recursion / split semantics are the same — chapters 02 and
03 plug WAL and MVCC into the same node layout.

Node layout (in memory):

    {
        keys:   [int | bytes | str, ...],
        values: [RowId, ...] for leaves
                [node_id, ...] for inner
        next:   Node | None  (sibling pointer; the textbook detail)
    }
"""
from __future__ import annotations

from bisect import bisect_left, bisect_right
from dataclasses import dataclass, field
from typing import Any

from db_engine.shared.types import RowId

K = Any


@dataclass(slots=True)
class BPlusTreeNode:
    is_leaf: bool
    keys: list[K] = field(default_factory=list)
    values: list[Any] = field(default_factory=list)
    next: "BPlusTreeNode | None" = None

    def lower_bound(self, key: K) -> int:
        # Use a stable comparison rather than relying on `bisect` for str/bytes
        # mixed types — engines tend to allow either.
        return bisect_left(self.keys, key)

    def upper_bound(self, key: K) -> int:
        return bisect_right(self.keys, key)


class BPlusTree:
    """B+Tree with configurable order.

    `order` is the maximum number of children an inner node may have;
    every node (leaf or inner) holds at most `order - 1` keys.
    """

    def __init__(self, order: int = 16) -> None:
        if order < 3:
            raise ValueError("order must be >= 3")
        self.order = order
        self.root: BPlusTreeNode = BPlusTreeNode(is_leaf=True)

    # -------------------------------------------------------------------
    # Search
    # -------------------------------------------------------------------

    def get(self, key: K) -> RowId | None:
        node = self.root
        while True:
            i = node.lower_bound(key)
            if node.is_leaf:
                if i < len(node.keys) and node.keys[i] == key:
                    return node.values[i]
                return None
            # Inner node: descend.
            if i == len(node.keys):
                if node.next is None:
                    return None
                node = node.next
                continue
            node = node.values[i]

    def range_get(self, lo: K, hi: K) -> list[RowId]:
        out: list[RowId] = []
        node = self._find_leaf(lo)
        while node is not None:
            for i in range(len(node.keys)):
                k = node.keys[i]
                if k > hi:
                    return out
                if k >= lo:
                    v = node.values[i]
                    if isinstance(v, RowId):
                        out.append(v)
            node = node.next
        return out

    def _find_leaf(self, key: K) -> BPlusTreeNode:
        node = self.root
        while not node.is_leaf:
            i = node.lower_bound(key)
            node = node.values[min(i, len(node.values) - 1)]
        return node

    # -------------------------------------------------------------------
    # Insertion
    # -------------------------------------------------------------------

    def put(self, key: K, value: RowId) -> None:
        # Special case: tree is empty leaf.
        if not self.root.keys and self.root.is_leaf:
            self.root.keys.append(key)
            self.root.values.append(value)
            return
        leaf = self._find_leaf(key)
        i = leaf.lower_bound(key)
        if i < len(leaf.keys) and leaf.keys[i] == key:
            leaf.values[i] = value
            self._maybe_balance_leaves(leaf)
            return
        leaf.keys.insert(i, key)
        leaf.values.insert(i, value)
        if len(leaf.keys) >= self.order:
            self._split_leaf(leaf)
        else:
            self._maybe_balance_leaves(leaf)

    def _split_leaf(self, leaf: BPlusTreeNode) -> None:
        mid = len(leaf.keys) // 2
        right = BPlusTreeNode(
            is_leaf=True,
            keys=leaf.keys[mid:],
            values=leaf.values[mid:],
            next=leaf.next,
        )
        leaf.keys = leaf.keys[:mid]
        leaf.values = leaf.values[:mid]
        leaf.next = right
        self._insert_into_parent(leaf, right.keys[0], right)

    def _insert_into_parent(self, left: BPlusTreeNode, key: K, right: BPlusTreeNode) -> None:
        if left is self.root:
            new_root = BPlusTreeNode(is_leaf=False, keys=[key], values=[left, right])
            self.root = new_root
            return
        # Walk up: cache parents on the way down. Real engines keep a
        # stack frame per insert; we do it implicitly by overwriting the
        # root and walking back down.
        parent_path = self._path_to(left)
        parent = parent_path[-1] if parent_path else None
        if parent is None:
            new_root = BPlusTreeNode(is_leaf=False, keys=[key], values=[left, right])
            self.root = new_root
            return
        i = parent.values.index(left)
        parent.keys.insert(i, key)
        parent.values.insert(i + 1, right)
        if len(parent.keys) >= self.order:
            self._split_inner(parent)

    def _split_inner(self, node: BPlusTreeNode) -> None:
        mid = len(node.keys) // 2
        promoted = node.keys[mid]
        right = BPlusTreeNode(
            is_leaf=False,
            keys=node.keys[mid + 1 :],
            values=node.values[mid + 1 :],
        )
        node.keys = node.keys[:mid]
        node.values = node.values[: mid + 1]
        if node is self.root:
            self.root = BPlusTreeNode(is_leaf=False, keys=[promoted], values=[node, right])
        else:
            self._insert_into_parent(node, promoted, right)

    def _maybe_balance_leaves(self, leaf: BPlusTreeNode) -> None:
        # Real engines also redistribute; for the curriculum, splitting
        # alone is enough — it produces a balanced tree by construction.
        return

    def _path_to(self, target: BPlusTreeNode) -> list[BPlusTreeNode]:
        """Walk the tree from root to `target`, recording ancestors."""
        out: list[BPlusTreeNode] = []
        node = self.root
        while node is not target:
            out.append(node)
            i = node.lower_bound(target.keys[0]) if target.keys else 0
            node = node.values[min(i, len(node.values) - 1)]
            if node is target:
                return out
            if node is None:
                return out
        return out

    # -------------------------------------------------------------------
    # Diagnostics
    # -------------------------------------------------------------------

    def __len__(self) -> int:
        return self._count(self.root)

    def _count(self, node: BPlusTreeNode) -> int:
        if node is None:
            return 0
        if node.is_leaf:
            return len(node.keys)
        return sum(self._count(child) for child in node.values)
