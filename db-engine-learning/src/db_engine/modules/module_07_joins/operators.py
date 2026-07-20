"""Join operators for chapter 07.

Three implementations:

    NL_JOIN         nested-loop, easy, O(N*M)
    HASH_JOIN       build hash on inner, probe with outer; O(N+M)
    SORT_MERGE_JOIN sort both sides, merge on the join key; O(N log N + M log M)

The optimizer (chapter 08) picks which to use. Module 07 builds
them and demonstrates each.
"""
from __future__ import annotations

from typing import Any

from db_engine._contracts.plan import OpKind
from db_engine.modules.module_06_executor.operators import _Op, register, evaluate
from db_engine.modules.module_06_executor.catalog import Catalog
from db_engine.shared.types import Row


# ---------------------------------------------------------------------------
# NL JOIN
# ---------------------------------------------------------------------------

@register(OpKind.NL_JOIN)
class _NLJoin(_Op):
    def __init__(self, op: Any, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        if len(self._children) != 2:
            raise ValueError("NL_JOIN requires two children")
        self._predicate = op.predicate
        self._outer_rows: list[Row] = []
        self._outer_index = 0
        self._inner_row: Row | None = None
        self._outer_schema = self._schema_of(0)
        self._inner_schema = self._schema_of(1)
        self._outer_consumed = False

    def _schema_of(self, idx: int) -> Any:
        op = self.op.children[idx]
        return op.schema or self.catalog.schema(op.table)  # type: ignore[union-attr]

    def open(self) -> None:
        # We materialise the outer side ourselves. Don't call super().open()
        # because that would advance both inner and outer once.
        self._children[0].open()
        self._outer_rows = []
        while True:
            row = self._children[0].next()
            if row is None:
                break
            self._outer_rows.append(row)
        self._outer_index = 0
        self._inner_row = None
        self._current_outer: Row | None = None

    def next(self) -> Row | None:
        while True:
            if self._inner_row is None:
                if self._outer_index >= len(self._outer_rows):
                    return None
                # Restart inner cursor.
                outer_row = self._outer_rows[self._outer_index]
                # Re-open the inner child.
                self._children[1].close()
                self._children[1].open()
                self._current_outer = outer_row
                self._inner_row = True  # sentinel; first fetch happens below
            inner_row = self._children[1].next()
            if inner_row is None:
                self._outer_index += 1
                self._inner_row = None
                continue
            # Concatenate the two rows; evaluate predicate.
            combined = self._current_outer.values + inner_row.values
            outer_schema = self._outer_schema
            inner_schema = self._inner_schema
            # Build combined schema for predicate evaluation:
            # the predicate might reference both sides.
            v = _evaluate_on(self._predicate, self._current_outer, inner_row, outer_schema, inner_schema)
            if v is True:
                return Row(rid=self._current_outer.rid, values=combined)
            if v is False:
                continue

    def close(self) -> None:
        super().close()
        self._outer_rows = []


def _evaluate_on(pred: Any, outer: Row, inner: Row, outer_schema: Any, inner_schema: Any) -> Any:
    if pred is None:
        return True
    # For a join predicate built from two column refs (left.a = right.b),
    # resolve left/right against the combined row.
    # Walk the predicate AST and remap column refs:
    from db_engine.modules.module_04_parser.ast_nodes import ExprKind
    combined = outer.values + inner.values

    def _eval(e):
        if e.kind is ExprKind.COLUMN:
            name = e.value.name
            table = e.value.table
            # Try outer, then inner.
            try:
                i = outer_schema.index(name)
                return combined[i]
            except KeyError:
                pass
            try:
                i = inner_schema.index(name)
                return combined[len(outer.values) + i]
            except KeyError:
                pass
            raise KeyError(name)
        if e.kind is ExprKind.LITERAL:
            return e.value
        if e.kind is ExprKind.BINOP and e.op in {"AND", "OR"}:
            l = _eval(e.args[0])
            r = _eval(e.args[1])
            if e.op == "AND":
                if l is False or r is False:
                    return False
                if l is None or r is None:
                    return None
                return True
            if e.op == "OR":
                if l is True or r is True:
                    return True
                if l is None or r is None:
                    return None
                return False
        if e.kind is ExprKind.COMPARE:
            l = _eval(e.args[0])
            r = _eval(e.args[1])
            if l is None or r is None:
                return None
            return {
                "=": l == r,
                "<": l < r,
                ">": l > r,
                "<=": l <= r,
                ">=": l >= r,
                "!=": l != r,
                "<>": l != r,
            }[e.op]
        raise ValueError(f"unsupported predicate kind {e.kind}")

    return _eval(pred)


# ---------------------------------------------------------------------------
# HASH JOIN
# ---------------------------------------------------------------------------

@register(OpKind.HASH_JOIN)
class _HashJoin(_Op):
    def __init__(self, op: Any, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        if len(self._children) != 2:
            raise ValueError("HASH_JOIN requires two children")
        self._key_expr = op.args["keys"][0] if "keys" in op.args else op.predicate
        self._probe_key = op.args.get("probe_keys", [None])[0]
        self._outer_schema = self._schema_of(0)
        self._inner_schema = self._schema_of(1)
        self._probe_schema = self._outer_schema
        self._hash_table: dict[Any, list[Row]] = {}
        self._probe_rows: list[Row] = []
        self._probe_idx = 0
        self._probe_iter: list[Row] | None = None
        self._cur_match_idx = 0
        self._cur_match: list[Row] | None = None

    def _schema_of(self, idx: int) -> Any:
        op = self.op.children[idx]
        return op.schema or self.catalog.schema(op.table)  # type: ignore[union-attr]

    def open(self) -> None:
        # Open children explicitly (don't call super().open() because
        # that would pre-advance them; we want a fresh read here).
        for c in self._children:
            c.open()
        build = self._children[0]
        probe = self._children[1]
        ht: dict[Any, list[Row]] = {}
        while True:
            row = build.next()
            if row is None:
                break
            k = _probe_expr(self._key_expr, row, self._schema_of(0))
            if k is None:
                continue
            ht.setdefault(k, []).append(row)
        probes: list[Row] = []
        while True:
            row = probe.next()
            if row is None:
                break
            probes.append(row)
        self._hash_table = ht
        self._probe_rows = probes
        self._probe_idx = 0
        self._probe_iter = None

    def next(self) -> Row | None:
        while True:
            if self._probe_iter is None:
                if self._probe_idx >= len(self._probe_rows):
                    return None
                prow = self._probe_rows[self._probe_idx]
                pk = _probe_expr(self._probe_key, prow, self._schema_of(1))
                self._cur_match = list(self._hash_table.get(pk, ()))
                self._cur_match_idx = 0
                self._probe_iter = [prow]
            for probe_row in self._probe_iter or []:
                if self._cur_match is None:
                    continue
                if self._cur_match_idx >= len(self._cur_match):
                    self._probe_iter = None
                    self._probe_idx += 1
                    break
                build_row = self._cur_match[self._cur_match_idx]
                self._cur_match_idx += 1
                return Row(rid=probe_row.rid, values=list(probe_row.values) + list(build_row.values))
            else:
                self._probe_iter = None
                self._probe_idx += 1

    def close(self) -> None:
        super().close()


def _probe_expr(expr: Any, row: Row, schema: Any) -> Any:
    from db_engine.modules.module_04_parser.ast_nodes import ExprKind
    if expr.kind is ExprKind.COLUMN:
        return row.values[schema.index(expr.value.name)]
    if expr.kind is ExprKind.LITERAL:
        return expr.value
    if expr.kind is ExprKind.COMPARE:
        l = _probe_expr(expr.args[0], row, schema)
        r = _probe_expr(expr.args[1], row, schema)
        if l is None or r is None:
            return None
        return {
            "=": l == r,
            "<": l < r,
            ">": l > r,
        }[expr.op]
    raise ValueError(f"unsupported join key kind {expr.kind}")


# ---------------------------------------------------------------------------
# SORT MERGE JOIN
# ---------------------------------------------------------------------------

@register(OpKind.SORT_MERGE_JOIN)
class _SortMergeJoin(_Op):
    def __init__(self, op: Any, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        if len(self._children) != 2:
            raise ValueError("SORT_MERGE_JOIN requires two children")
        self._left_schema = self._schema_of(0)
        self._right_schema = self._schema_of(1)
        self._left_key_expr = op.args["keys"][0]
        self._right_key_expr = op.args.get("right_keys", [self._left_key_expr])[0]
        self._buffer = None

    def _schema_of(self, idx: int) -> Any:
        op = self.op.children[idx]
        return op.schema or self.catalog.schema(op.table)  # type: ignore[union-attr]

    def open(self) -> None:
        for c in self._children:
            c.open()
        left_rows: list[Row] = []
        while True:
            row = self._children[0].next()
            if row is None:
                break
            left_rows.append(row)
        right_rows: list[Row] = []
        while True:
            row = self._children[1].next()
            if row is None:
                break
            right_rows.append(row)

        def keyf(rows, expr, schema):
            return sorted(rows, key=lambda r: _probe_expr(expr, r, schema))

        left_rows = keyf(left_rows, self._left_key_expr, self._left_schema)
        right_rows = keyf(right_rows, self._right_key_expr, self._right_schema)
        self._iter = None

    def next(self) -> Row | None:
        if self._iter is None:
            self._iter = iter(self._buffer)
        try:
            return next(self._iter)
        except StopIteration:
            return None


class _Merge:
    def __init__(self, left, right, lk, rk, ls, rs):
        self.left = left
        self.right = right
        self.lk = lk
        self.rk = rk
        self.ls = ls
        self.rs = rs
        self.i = 0
        self.j = 0

    def __iter__(self):
        while self.i < len(self.left) and self.j < len(self.right):
            lk = _probe_expr(self.lk, self.left[self.i], self.ls)
            rk = _probe_expr(self.rk, self.right[self.j], self.rs)
            if lk == rk:
                # Emit (left[i], right[j]). For multiple matches,
                # advance j; for ties on left, advance i.
                yield Row(rid=self.left[self.i].rid,
                          values=list(self.left[self.i].values) + list(self.right[self.j].values))
                self.j += 1
                if self.j >= len(self.right):
                    self.j = 0
                    self.i += 1
            elif lk < rk:
                self.i += 1
            else:
                self.j += 1



__all__ = []
