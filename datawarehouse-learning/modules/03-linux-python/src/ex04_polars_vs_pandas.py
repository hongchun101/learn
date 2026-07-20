"""Module 03 / ch03 — pandas vs polars, same task.

The same group-by / sum / sort task done in two libraries, so
you can see how the APIs differ.  Run:

    python modules/03-linux-python/src/ex04_polars_vs_pandas.py
"""
from __future__ import annotations

import time
from pathlib import Path

import pandas as pd
import polars as pl

DATA = Path("data") / "small" / "orders.parquet"


def pandas_pipeline() -> pd.DataFrame:
    t0 = time.perf_counter()
    df = pd.read_parquet(DATA)
    df = df.dropna(subset=["order_id", "user_id", "total"])
    df = df[df["total"] > 0]
    df["dt"] = pd.to_datetime(df["order_ts"]).dt.date
    out = (df.groupby(["user_id", "dt"])
             .agg(n=("order_id", "count"),
                  gmv=("total", "sum"))
             .reset_index()
             .sort_values("gmv", ascending=False)
             .head(10))
    print(f"pandas: {time.perf_counter() - t0:.2f}s, top:")
    print(out)
    return out


def polars_pipeline() -> pl.DataFrame:
    t0 = time.perf_counter()
    out = (pl.scan_parquet(DATA)
             .filter(pl.col("total") > 0)
             .drop_nulls(["order_id", "user_id", "total"])
             .with_columns(
                 pl.col("order_ts").dt.date().alias("dt")
             )
             .group_by("user_id", "dt")
             .agg(
                 pl.len().alias("n"),
                 pl.col("total").sum().alias("gmv"),
             )
             .sort("gmv", descending=True)
             .head(10)
             .collect())
    print(f"polars: {time.perf_counter() - t0:.2f}s, top:")
    print(out)
    return out


if __name__ == "__main__":
    pa = pandas_pipeline()
    pl_df = polars_pipeline()
    # Same data, different library
    print()
    print(f"pandas: {len(pa)} rows, polars: {pl_df.height} rows")
