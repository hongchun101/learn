"""Tests for the Spark-style demo.

These tests verify the Polars-backed implementation in ``src/spark_demo.py``
behaves the way the corresponding PySpark DataFrame APIs would:

    * ``group_by_agg`` matches an independent hand-computed aggregate
    * ``broadcast_join`` preserves rows and exposes the dim columns
    * ``window_rank`` returns 1-based dense ranks within each partition
    * ``with_column`` derived column equals a reference expression
    * ``repartition_and_count`` simulates a balanced shuffle
"""
from __future__ import annotations

import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import polars as pl
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

# ``06-spark`` starts with a digit, so it isn't a normal Python identifier.
# Load the demo module by file path instead of via ``import``.
_spec = spec_from_file_location(
    "spark_demo",
    ROOT / "modules" / "06-spark" / "src" / "spark_demo.py",
)
spark_demo = module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(spark_demo)

broadcast_join = spark_demo.broadcast_join
group_by_agg = spark_demo.group_by_agg
read_ods = spark_demo.read_ods
repartition_and_count = spark_demo.repartition_and_count
run_demo = spark_demo.run_demo
window_rank = spark_demo.window_rank
with_column = spark_demo.with_column

DATA_DIR = ROOT / "data" / "small"


@pytest.fixture(scope="module")
def tables() -> dict[str, pl.DataFrame]:
    return read_ods(DATA_DIR)


# ---------------------------------------------------------------------------
# Test 1 -- groupBy/agg semantics match a hand-rolled reference aggregate
# ---------------------------------------------------------------------------

def test_group_by_agg_matches_hand_rolled_aggregate(tables):
    orders = tables["orders"]

    gmv = group_by_agg(
        orders,
        keys=["user_id"],
        aggs={"gmv": "total_sum", "n_orders": "order_id_count"},
    )

    # Reference: independent computation that does NOT use spark_demo.
    ref = (
        orders.group_by("user_id")
        .agg(pl.col("total").sum().alias("gmv"),
             pl.col("order_id").count().alias("n_orders"))
        .sort("user_id")
    )

    assert gmv.height == ref.height, "row count must match"
    assert gmv.columns == ["user_id", "gmv", "n_orders"], "schema must match"
    assert gmv["user_id"].to_list() == ref["user_id"].to_list(), \
        "keys must align"
    assert gmv["n_orders"].to_list() == ref["n_orders"].to_list(), \
        "order_id_count must equal independent count"
    assert all(abs(a - b) < 1e-6 for a, b in
               zip(gmv["gmv"].to_list(), ref["gmv"].to_list())), \
        "gmv must equal independent sum within float tolerance"


# ---------------------------------------------------------------------------
# Test 2 -- broadcast_join preserves rows and brings in dim columns
# ---------------------------------------------------------------------------

def test_broadcast_join_preserves_rows_and_dim_columns(tables):
    orders = tables["orders"]
    users = tables["users"]

    joined = broadcast_join(
        orders,
        users.select(["user_id", "level", "gender"]),
        on="user_id",
        how="inner",
    )

    # Inner join should keep every order whose user_id exists in users.
    expected_rows = orders.join(users, on="user_id", how="inner").height
    assert joined.height == expected_rows, \
        "inner broadcast_join row count must match plain inner join"

    # Original order columns must still be there, plus the dim columns.
    for c in ("order_id", "user_id", "total", "status", "order_date"):
        assert c in joined.columns, f"order column {c!r} missing"
    assert "level" in joined.columns and "gender" in joined.columns, \
        "user dimension columns must be present after broadcast join"

    # GMV (sum of total) must agree with the raw orders frame, since we
    # did an inner join -- no rows are dropped or duplicated.
    assert abs(joined["total"].sum() - orders["total"].sum()) < 1e-6


# ---------------------------------------------------------------------------
# Test 3 -- window_rank returns 1-based ranks within each partition
# ---------------------------------------------------------------------------

def test_window_rank_gives_one_based_ranks_within_partition(tables):
    products = tables["products"]
    ranked = window_rank(
        products,
        partition_by=["category"],
        order_by="price",
        descending=True,
    )

    # One rank row per product.
    assert ranked.height == products.height

    # Within each category, ranks must be a 1..N permutation.
    for cat, sub in ranked.group_by("category"):
        ranks = sorted(sub["rk"].to_list())
        assert ranks == list(range(1, len(sub) + 1)), \
            f"category={cat!r}: ranks {ranks} not a 1..N permutation"

    # The rank-1 row in each category must be the most expensive product.
    top1 = ranked.filter(pl.col("rk") == 1).sort("category")
    expected_top1 = (
        products.group_by("category")
        .agg(pl.col("price").max().alias("price"))
        .sort("category")
    )
    assert top1["price"].to_list() == expected_top1["price"].to_list(), \
        "rank-1 row in each category must be the highest-priced product"


# ---------------------------------------------------------------------------
# Test 4 -- withColumn derived column equals a reference expression
# ---------------------------------------------------------------------------

def test_with_column_derived_column_matches_reference(tables):
    orders = tables["orders"]

    bucketed = with_column(
        orders,
        name="amount_bucket",
        expr=pl.when(pl.col("total") < 100)
        .then(pl.lit("small"))
        .when(pl.col("total") < 1000)
        .then(pl.lit("medium"))
        .otherwise(pl.lit("large")),
    )

    # Reference expression computed independently of spark_demo.with_column.
    ref_bucket = (
        pl.when(pl.col("total") < 100)
        .then(pl.lit("small"))
        .when(pl.col("total") < 1000)
        .then(pl.lit("medium"))
        .otherwise(pl.lit("large"))
        .alias("amount_bucket")
    )
    expected = orders.with_columns(ref_bucket)

    assert "amount_bucket" in bucketed.columns, \
        "with_column must add the new column"
    assert bucketed["amount_bucket"].to_list() == \
        expected["amount_bucket"].to_list(), \
        "derived bucket values must match reference expression"

    # Spot-check: counts per bucket must be non-empty / mutually exclusive.
    counts = (
        bucketed.group_by("amount_bucket").agg(pl.len().alias("n")).sort("amount_bucket")
    )
    bucket_labels = counts["amount_bucket"].to_list()
    assert set(bucket_labels) == {"small", "medium", "large"}, \
        f"unexpected bucket labels: {bucket_labels}"
    assert all(n > 0 for n in counts["n"].to_list()), \
        "every bucket should have at least one order"


# ---------------------------------------------------------------------------
# Test 5 (bonus) -- repartition simulates a balanced shuffle
# ---------------------------------------------------------------------------

def test_repartition_produces_balanced_partitions(tables):
    orders = tables["orders"]
    n_total, sizes = repartition_and_count(orders, n_partitions=8, by="user_id")
    assert n_total == orders.height
    assert len(sizes) == 8
    assert sum(sizes) == orders.height, \
        "partition sizes must sum to total row count"
    # No single partition should hold more than ~50% of rows for a hash on
    # user_id (there are 1000 distinct users and 10000 orders, so the spread
    # is reasonably even).
    assert max(sizes) < orders.height * 0.5, \
        f"hash partitioner produced a skewed split: {sizes}"
