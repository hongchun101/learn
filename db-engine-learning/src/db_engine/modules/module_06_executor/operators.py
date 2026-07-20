"""The Volcano executor.

`Operator` is a node in the physical plan; `Executor` opens it,
calls `next()` until EOS, then closes.

Every operator has the same three-phase lifecycle:
    open()  — bind to catalog / child
    next()  — return next row or None
    close() — release resources

The executor in this file is row-at-a-time. Module 10 rewrites
the leaf ops as batch operators and demonstrates vectorized
execution.
"""
from __future__ import annotations

from typing import Any, Iterator

from db_engine._contracts.executor import Executor as ExecutorContract
from db_engine._contracts.plan import OpKind, Operator
from db_engine.modules.module_04_parser.ast_nodes import ExprKind
from db_engine.modules.module_06_executor.catalog import Catalog
from db_engine.modules.module_06_executor.expressions import eval_expr
from db_engine.shared.types import Row, Schema


# Forward declaration so we can mutate _NODE_REGISTRY.
_NODE_REGISTRY: dict[OpKind, type] = {}


def register(kind: OpKind):
    def deco(cls: type) -> type:
        _NODE_REGISTRY[kind] = cls
        return cls
    return deco


def evaluate(expr: Any, row: list, schema: Schema | None) -> Any:
    return eval_expr(expr, row, schema)


# ---------------------------------------------------------------------------
# Volcano base
# ---------------------------------------------------------------------------

class _Op:
    """Base class for a single executor node."""

    def __init__(self, op: Operator, catalog: Catalog) -> None:
        self.op = op
        self.catalog = catalog
        self._children = [_NODE_REGISTRY[c.kind](c, catalog) for c in op.children]

    def open(self) -> None:
        for c in self._children:
            c.open()

    def next(self) -> Row | None:
        raise NotImplementedError

    def close(self) -> None:
        for c in self._children:
            c.close()


# ---------------------------------------------------------------------------
# SCAN
# ---------------------------------------------------------------------------

@register(OpKind.SCAN)
class _Scan(_Op):
    def __init__(self, op: Operator, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        if op.table is None:
            raise ValueError("scan requires a table name")
        self._table = catalog.get(op.table)
        self._iter: Iterator[Row] | None = None

    def open(self) -> None:
        super().open()
        self._iter = iter(self._table.all_rows())

    def next(self) -> Row | None:
        assert self._iter is not None
        try:
            return next(self._iter)
        except StopIteration:
            return None

    def close(self) -> None:
        self._iter = None
        super().close()


# ---------------------------------------------------------------------------
# FILTER
# ---------------------------------------------------------------------------

@register(OpKind.FILTER)
class _Filter(_Op):
    def __init__(self, op: Operator, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        if op.predicate is None:
            raise ValueError("filter requires a predicate")
        self._pred = op.predicate

    def open(self) -> None:
        super().open()

    def next(self) -> Row | None:
        while True:
            row = self._children[0].next()
            if row is None:
                return None
            schema = self._child_schema()
            v = evaluate(self._pred, row.values, schema)
            if v is True:
                return row
            if v is False:
                continue
            # NULL: skip (curriculum choice; SQL would say UNKNOWN ⇒
            # excluded by WHERE).

    def _child_schema(self) -> Schema:
        child_op = self.op.children[0]
        return child_op.schema or self.catalog.schema(child_op.table)  # type: ignore[union-attr]

    def close(self) -> None:
        super().close()


# ---------------------------------------------------------------------------
# PROJECT
# ---------------------------------------------------------------------------

@register(OpKind.PROJECT)
class _Project(_Op):
    def __init__(self, op: Operator, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        cols = op.columns if op.columns is not None else op.args.get("columns")
        if cols is None:
            raise ValueError("project requires columns")
        self._cols: tuple = tuple(cols)

    def next(self) -> Row | None:
        row = self._children[0].next()
        if row is None:
            return None
        schema = self._child_schema()
        out = [evaluate(c, row.values, schema) for c in self._cols]
        return Row(rid=row.rid, values=out)

    def _child_schema(self) -> Schema:
        child_op = self.op.children[0]
        return child_op.schema or self.catalog.schema(child_op.table)  # type: ignore[union-attr]


# ---------------------------------------------------------------------------
# SORT
# ---------------------------------------------------------------------------

@register(OpKind.SORT)
class _Sort(_Op):
    def __init__(self, op: Operator, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        self._keys: list = list(op.args.get("sort_keys", []))
        self._buffered: list[Row] | None = None

    def open(self) -> None:
        super().open()
        # Materialise child rows.
        self._buffered = []
        while True:
            row = self._children[0].next()
            if row is None:
                break
            self._buffered.append(row)
        schema = self._child_schema()
        # Sort with stability; key encodes (value, row position) so
        # ties preserve insertion order.
        indices = list(range(len(self._buffered)))
        indices.sort(key=lambda i: tuple(
            (evaluate(k, self._buffered[i].values, schema), i)  # type: ignore[arg-type]
            for k, _asc in self._keys
        ))
        self._buffered = [self._buffered[i] for i in indices]
        self._iter = iter(self._buffered)

    def next(self) -> Row | None:
        try:
            return next(self._iter)  # type: ignore[union-attr]
        except StopIteration:
            return None

    def _child_schema(self) -> Schema:
        child_op = self.op.children[0]
        return child_op.schema or self.catalog.schema(child_op.table)  # type: ignore[union-attr]

    def close(self) -> None:
        super().close()
        self._buffered = None


# ---------------------------------------------------------------------------
# LIMIT
# ---------------------------------------------------------------------------

@register(OpKind.LIMIT)
class _Limit(_Op):
    def __init__(self, op: Operator, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        self._n = op.args.get("limit", op.children[0].args.get("limit"))
        if self._n is None:
            raise ValueError("limit requires a count")
        self._remaining = 0

    def open(self) -> None:
        super().open()
        self._remaining = int(self._n)

    def next(self) -> Row | None:
        if self._remaining <= 0:
            return None
        row = self._children[0].next()
        if row is None:
            return None
        self._remaining -= 1
        return row


# ---------------------------------------------------------------------------
# HASH AGGREGATE
# ---------------------------------------------------------------------------

@register(OpKind.HASH_AGG)
class _HashAgg(_Op):
    """Naive hash aggregate with a single group key.

    Group-by clauses hash by the first group key; the agg function is
    COUNT(*) by default. Other aggregates live in chapter 14.
    """

    def __init__(self, op: Operator, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        self._group_keys = op.args.get("group_keys", (op.group_keys if hasattr(op, "group_keys") else (),))
        self._iter = None

    def open(self) -> None:
        super().open()
        # Two-phase: aggregate from child rows.
        groups: dict[Any, list[Row]] = {}
        while True:
            row = self._children[0].next()
            if row is None:
                break
            schema = self._child_schema()
            if self._group_keys == ():
                key = None
            else:
                key = evaluate(self._group_keys[0], row.values, schema)  # type: ignore[arg-type]
            groups.setdefault(key, []).append(row)
        # Emit one row per group (group key + count). Schema is not
        # yet propagated through the catalog, so we use the parent's
        # schema if set.
        out = []
        for k, rows in groups.items():
            out.append(Row(rid=rows[0].rid, values=[k, len(rows)]))
        self._iter = iter(out)

    def next(self) -> Row | None:
        try:
            return next(self._iter)  # type: ignore[union-attr]
        except StopIteration:
            return None

    def _child_schema(self) -> Schema:
        child_op = self.op.children[0]
        return child_op.schema or self.catalog.schema(child_op.table)  # type: ignore[union-attr]

    def close(self) -> None:
        super().close()


# ---------------------------------------------------------------------------
# INSERT
# ---------------------------------------------------------------------------

@register(OpKind.INSERT)
class _Insert(_Op):
    def __init__(self, op: Operator, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        if op.table is None:
            raise ValueError("insert requires a table")
        self._table = catalog.get(op.table)
        self._values = op.args.get("values", ())
        self._emitted = False

    def open(self) -> None:
        self._emitted = False

    def next(self) -> Row | None:
        if self._emitted:
            return None
        # Evaluate each value list and insert.
        for row_vals in self._values:
            evaluated = [_lit(v) for v in row_vals]
            self._table.insert(evaluated)
        self._emitted = True
        return Row(rid=None, values=[len(self._table.rows)])


@register(OpKind.CREATE_TABLE)
class _CreateTable(_Op):
    def __init__(self, op: Operator, catalog: Catalog) -> None:
        super().__init__(op, catalog)
        self._catalog = catalog
        self._table_name = op.args.get("table_name") or op.table
        if op.schema is not None:
            self._schema = op.schema
        else:
            from db_engine.shared.types import Column, Schema, SqlType
            cols = [Column(name=n, sql_type=SqlType(t)) for n, t in op.args.get("cols", [])]
            self._schema = Schema(tuple(cols))
        self._done = False

    def open(self) -> None:
        self._done = False

    def next(self) -> Row | None:
        if self._done:
            return None
        self._catalog.create_table(self._table_name, self._schema)
        self._done = True
        return Row(rid=None, values=[self._table_name])


def _lit(expr) -> Any:
    if isinstance(expr, dict) and "kind" in expr:
        return expr.get("value")
    if hasattr(expr, "kind"):
        return getattr(expr, "value", None)
    return expr


# ---------------------------------------------------------------------------
# Executor driver
# ---------------------------------------------------------------------------

class Executor(ExecutorContract):
    """Open an operator tree, pull rows until EOS."""

    def __init__(self, catalog: Catalog) -> None:
        self.catalog = catalog
        self._root: _Op | None = None

    def open(self, root: Operator) -> None:
        node_cls = _NODE_REGISTRY.get(root.kind)
        if node_cls is None:
            raise ValueError(f"no executor for op kind {root.kind}")
        self._root = node_cls(root, self.catalog)
        self._root.open()

    def next(self) -> Row | None:
        assert self._root is not None
        return self._root.next()

    def close(self) -> None:
        if self._root is not None:
            self._root.close()
            self._root = None


def run_operator(catalog: Catalog, root: Operator) -> list[Row]:
    """Convenience: open → drain → close, returning all rows."""
    out: list[Row] = []
    e = Executor(catalog)
    for row in e.run(root):
        out.append(row)
    return out


__all__ = ["Executor", "run_operator", "evaluate"]
