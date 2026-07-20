"""Module 03 / ch04 — production-style ETL template.

Run with:
    python modules/03-linux-python/src/ex05_etl_template.py \
        --src data/small/orders.parquet \
        --dst data/tmp/dwd_orders.parquet
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

LOG = logging.getLogger("etl")
SCHEMA = pa.schema([
    ("order_id", pa.int64()),
    ("user_id",  pa.int64()),
    ("total",    pa.decimal128(18, 2)),
    ("status",   pa.string()),
    ("dt",       pa.date32()),
])


def setup_logging() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def with_retry(fn, *, attempts: int = 3, sleep: float = 2.0):
    last = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:
            last = e
            if i == attempts - 1:
                raise
            LOG.warning("attempt %d failed: %s; retrying", i + 1, e)
            time.sleep(sleep * (2 ** i))
    raise last  # unreachable


def extract(src: Path) -> pa.Table:
    LOG.info("extract from %s", src)
    return pq.read_table(src)


def validate(t: pa.Table) -> None:
    if t.num_rows == 0:
        raise ValueError("empty input")
    LOG.info("validate ok: %d rows", t.num_rows)


def _to_table(arrow_obj) -> pa.Table:
    """DuckDB .arrow() returns a RecordBatchReader; pq.write_table needs a Table."""
    if isinstance(arrow_obj, pa.Table):
        return arrow_obj
    if hasattr(arrow_obj, "read_all"):
        return arrow_obj.read_all()
    # RecordBatchReader / chunked iterator → concatenate
    return pa.Table.from_batches(list(arrow_obj))


def transform(t: pa.Table) -> pa.Table:
    LOG.info("transform via DuckDB: dedup + conform")
    con = duckdb.connect(":memory:")
    con.register("raw", t)
    out = con.execute("""
        SELECT
          order_id, user_id,
          CAST(total AS DECIMAL(18,2)) AS total,
          CASE WHEN status IN ('created','paid','shipped',
                               'completed','cancelled','refunded')
               THEN status ELSE 'unknown' END AS status,
          CAST(order_ts AS DATE) AS dt
        FROM (
          SELECT *, ROW_NUMBER() OVER
            (PARTITION BY order_id ORDER BY order_ts DESC) rn
          FROM raw
          WHERE order_id IS NOT NULL
            AND user_id  IS NOT NULL
            AND total    IS NOT NULL
        )
        WHERE rn = 1
    """).arrow()
    return _to_table(out)


def load(t: pa.Table, dst: Path) -> None:
    LOG.info("load to %s (%d rows)", dst, t.num_rows)
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".tmp")
    pq.write_table(t, tmp, compression="zstd")
    os.replace(tmp, dst)
    LOG.info("loaded ok")


def run(src: Path, dst: Path) -> int:
    setup_logging()
    t0 = time.perf_counter()
    raw   = with_retry(lambda: extract(src))
    validate(raw)
    clean = transform(raw)
    with_retry(lambda: load(clean, dst))
    LOG.info("done in %.2fs", time.perf_counter() - t0)
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--src", required=True, type=Path)
    p.add_argument("--dst", required=True, type=Path)
    args = p.parse_args()
    sys.exit(run(args.src, args.dst))
