"""Spark-style DataFrame demo, implemented on top of Polars.

This module mirrors a subset of the PySpark DataFrame API on a single
node so that the curriculum can exercise Spark idioms without standing
up a cluster. Every public function takes / returns plain Polars
DataFrames, which is structurally what a Spark DataFrame is: a lazily
planned, partition-aware, schema-bound distributed table.

The functions covered:
    * read_ods              -- load Parquet tables the way Spark would
                                read from Hive / a file source
    * group_by_agg          -- df.groupBy(...).agg(...)
    * with_column           -- df.withColumn(name, expr)
    * broadcast_join        -- df.join(broadcast(small), on, how)
    * window_rank           -- df.withColumn(rank).over(Window.partitionBy.orderBy)
    * repartition_and_count -- simulate a shuffle, check partition sizes
    * run_demo              -- end-to-end orchestrator over the demo data
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Mapping

import polars as pl


# ---------------------------------------------------------------------------
# I/O -- Spark reads distributed files; here we just read a directory of
# Parquet files and hand them back as named Polars frames.
# ---------------------------------------------------------------------------

def read_ods(data_dir: str | Path) -> dict[str, pl.DataFrame]:
    """Load every Parquet file under ``data_dir`` as a named DataFrame.

    Mirrors ``spark.read.parquet("<dir>")`` in the sense that the table
    name is the file stem and the schema is taken from the Parquet footers.
    """
    data_dir = Path(data_dir)
    tables: dict[str, pl.DataFrame] = {}
    for p in sorted(data_dir.glob("*.parquet")):
        tables[p.stem] = pl.read_parquet(p.as_posix())
    return tables


# ---------------------------------------------------------------------------
# groupBy / agg
# ---------------------------------------------------------------------------

AggSpec = Mapping[str, str]
"""A tiny ``agg`` spec: mapping from output column name to a Polars
expression over the input columns. Example::

    {"gmv": "total_sum", "n_orders": "order_id_count"}

Spark's ``pyspark.sql.functions.sum / count / avg`` map one-to-one to
the Polars expressions below.
"""


def group_by_agg(
    df: pl.DataFrame,
    keys: list[str],
    aggs: AggSpec,
) -> pl.DataFrame:
    """Spark-style ``df.groupBy(*keys).agg(*exprs)``.

    ``aggs`` is a small ``{alias: "<col>_<op>"}`` dict that is enough
    for the demo data. Supported ops: ``sum``, ``count``, ``mean``,
    ``min``, ``max``. The op is the LAST underscore-separated token so
    column names may themselves contain underscores (e.g.
    ``order_id_count``).
    """
    if not keys:
        raise ValueError("group_by_agg requires at least one key")
    exprs: list[pl.Expr] = []
    for alias, spec in aggs.items():
        if "_" not in spec:
            raise ValueError(f"agg spec '{spec}' must look like '<col>_<op>'")
        col, op = spec.rsplit("_", 1)
        base = pl.col(col)
        if op == "sum":
            exprs.append(base.sum().alias(alias))
        elif op == "count":
            exprs.append(base.count().alias(alias))
        elif op in ("mean", "avg"):
            exprs.append(base.mean().alias(alias))
        elif op == "min":
            exprs.append(base.min().alias(alias))
        elif op == "max":
            exprs.append(base.max().alias(alias))
        else:
            raise ValueError(f"unsupported agg op '{op}' in spec '{spec}'")
    return df.group_by(*[pl.col(k) for k in keys]).agg(exprs).sort(keys)


# ---------------------------------------------------------------------------
# withColumn
# ---------------------------------------------------------------------------

def with_column(
    df: pl.DataFrame,
    name: str,
    expr: pl.Expr,
) -> pl.DataFrame:
    """Spark-style ``df.withColumn(name, expr)``."""
    return df.with_columns(expr.alias(name))


# ---------------------------------------------------------------------------
# Broadcast Join -- conceptually identical to Spark's broadcast hash join.
# ---------------------------------------------------------------------------

def broadcast_join(
    left: pl.DataFrame,
    right: pl.DataFrame,
    on: str | list[str],
    how: str = "inner",
) -> pl.DataFrame:
    """Spark-style ``df_left.join(broadcast(df_right), on, how)``.

    We don't actually shuffle; the implementation just performs the
    local join. The "broadcast" intent is documented via the function
    name so callers express *why* they chose this path.
    """
    return left.join(right, on=on, how=how)


# ---------------------------------------------------------------------------
# Window functions
# ---------------------------------------------------------------------------

def window_rank(
    df: pl.DataFrame,
    partition_by: list[str],
    order_by: str,
    descending: bool = True,
) -> pl.DataFrame:
    """Spark-style ``rank().over(Window.partitionBy(*p).orderBy(o))``.

    Returns the input frame with a new column ``rk`` containing 1-based
    ordinal ranks within each partition.
    """
    desc = bool(descending)
    return (
        df.with_columns(
            pl.col(order_by)
            .rank(method="ordinal", descending=desc)
            .over(partition_by)
            .alias("rk")
        )
        .sort(
            partition_by + [order_by],
            descending=[False] * len(partition_by) + [desc],
        )
    )


# ---------------------------------------------------------------------------
# Shuffle / repartition diagnostics -- mirror spark.sql.shuffle.partitions
# ---------------------------------------------------------------------------

def repartition_and_count(
    df: pl.DataFrame,
    n_partitions: int,
    by: str | None = None,
) -> tuple[int, list[int]]:
    """Simulate a ``df.repartition(n, by)`` and return partition sizes.

    Hashes ``by`` (or the row index if ``by`` is None) into
    ``n_partitions`` buckets the way Spark's ``HashPartitioner`` does,
    then reports row counts per bucket. This is what Spark's UI shows
    under the ``Partition Stats`` tab.
    """
    if n_partitions <= 0:
        raise ValueError("n_partitions must be positive")
    if by is None:
        idx = pl.int_range(0, df.height, dtype=pl.UInt32)
        part_expr = (idx % n_partitions).cast(pl.Int64)
    else:
        part_expr = (pl.col(by).hash() % n_partitions).cast(pl.Int64)
    with_part = df.with_columns(part_expr.alias("_part"))
    counts_df = (
        with_part.group_by("_part")
        .agg(pl.len().alias("rows"))
        .sort("_part")
    )
    counts = counts_df["rows"].to_list()
    # Pad / truncate to ``n_partitions`` so callers always get a stable shape.
    counts = (counts + [0] * n_partitions)[:n_partitions]
    return df.height, counts


# ---------------------------------------------------------------------------
# Orchestrator -- end-to-end run on the demo e-commerce dataset.
# ---------------------------------------------------------------------------

def run_demo(data_dir: str | Path = "data/small") -> dict[str, pl.DataFrame]:
    """Run the full Spark-style pipeline on the demo data and return the
    result frames keyed by name.

    The pipeline mirrors what a real Spark job would do:
        1. read five Parquet tables (orders, order_items, ...)
        2. groupBy(orders).agg to compute user GMV
        3. broadcast_join with the users dimension
        4. window_rank to compute per-category top-N products
        5. withColumn to derive an order size bucket
    """
    tables = read_ods(data_dir)
    orders: pl.DataFrame = tables["orders"]
    order_items: pl.DataFrame = tables["order_items"]
    products: pl.DataFrame = tables["products"]
    users: pl.DataFrame = tables["users"]

    # 1) GMV per user
    user_gmv = group_by_agg(
        orders,
        keys=["user_id"],
        aggs={"gmv": "total_sum", "n_orders": "order_id_count"},
    )

    # 2) Broadcast join orders <-> users (users is the small dim)
    orders_with_user = broadcast_join(
        orders,
        users.select(["user_id", "level", "gender"]),
        on="user_id",
        how="inner",
    )

    # 3) Window rank: per category, rank products by price desc
    products_ranked = window_rank(
        products,
        partition_by=["category"],
        order_by="price",
        descending=True,
    )

    # 4) withColumn: bucket orders by total
    orders_bucketed = with_column(
        orders,
        name="amount_bucket",
        expr=pl.when(pl.col("total") < 100)
        .then(pl.lit("small"))
        .when(pl.col("total") < 1000)
        .then(pl.lit("medium"))
        .otherwise(pl.lit("large")),
    )

    # 5) Per-order item counts (groupBy on order_items side for variety)
    items_per_order = group_by_agg(
        order_items,
        keys=["order_id"],
        aggs={"n_items": "item_id_count", "qty_sum": "quantity_sum"},
    )

    return {
        "user_gmv": user_gmv,
        "orders_with_user": orders_with_user,
        "products_ranked": products_ranked,
        "orders_bucketed": orders_bucketed,
        "items_per_order": items_per_order,
    }


if __name__ == "__main__":
    out = run_demo("data/small")
    for name, df in out.items():
        print(f"\n== {name} ({df.height} rows) ==")
        print(df.head(5))
