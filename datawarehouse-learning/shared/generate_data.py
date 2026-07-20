"""Deterministic e-commerce dataset generator.

Produces a single Parquet file set used by every module in the
curriculum. The schema is deliberately small enough to fit in
DuckDB memory (the default scale) but realistic enough to exercise
all warehouse patterns (joins, windows, recursion, SCD).

Usage:
    python shared/generate_data.py --scale small
    python shared/generate_data.py --scale medium
    python shared/generate_data.py --scale large

Outputs go to data/<scale>/*.parquet and a DuckDB file
data/<scale>/warehouse.duckdb.
"""
from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta
from pathlib import Path

import duckdb
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

# ---- deterministic seed for reproducible curricula -----------------

SEED = 20240101

SCALES = {
    "small": dict(users=1_000, products=200, orders=10_000, events=50_000),
    "medium": dict(users=10_000, products=1_000, orders=100_000, events=500_000),
    "large": dict(users=100_000, products=5_000, orders=1_000_000, events=5_000_000),
}

CATEGORIES = [
    ("electronics", ["phone", "laptop", "tablet", "headphone", "tv"]),
    ("apparel", ["shirt", "pants", "dress", "shoes", "hat"]),
    ("home", ["chair", "table", "lamp", "bed", "shelf"]),
    ("beauty", ["lipstick", "cream", "perfume", "mask", "serum"]),
    ("sports", ["ball", "racket", "shoe", "bike", "weights"]),
]

LEVELS = ["bronze", "silver", "gold", "platinum"]
ORDER_STATUS = ["created", "paid", "shipped", "completed", "cancelled", "refunded"]
EVENT_TYPES = ["pv", "cart", "fav", "pay"]


def gen_users(n: int) -> pd.DataFrame:
    rng = random.Random(SEED)
    rows = []
    start = datetime(2023, 1, 1)
    for i in range(1, n + 1):
        rows.append(dict(
            user_id=i,
            user_name=f"user_{i:08d}",
            level=rng.choice(LEVELS),
            register_date=(start + timedelta(days=rng.randint(0, 600))).date(),
            age=rng.randint(18, 65),
            gender=rng.choice(["M", "F"]),
        ))
    return pd.DataFrame(rows)


def gen_products(n: int) -> pd.DataFrame:
    rng = random.Random(SEED + 1)
    rows = []
    pid = 1
    for cat, names in CATEGORIES:
        for nm in names:
            for k in range(n // (len(CATEGORIES) * len(names)) + 1):
                if pid > n:
                    break
                rows.append(dict(
                    product_id=pid,
                    product_name=f"{cat}_{nm}_{k}",
                    category=cat,
                    sub_category=nm,
                    price=round(rng.uniform(10, 5000), 2),
                ))
                pid += 1
    return pd.DataFrame(rows[:n])


def gen_orders(n: int, n_users: int) -> pd.DataFrame:
    rng = random.Random(SEED + 2)
    rows = []
    start = datetime(2024, 1, 1)
    for i in range(1, n + 1):
        ts = start + timedelta(
            days=rng.randint(0, 364),
            seconds=rng.randint(0, 86_400),
        )
        rows.append(dict(
            order_id=i,
            user_id=rng.randint(1, n_users),
            total=round(rng.uniform(20, 5000), 2),
            status=rng.choices(ORDER_STATUS, weights=[1, 5, 3, 4, 1, 1])[0],
            order_date=ts.date(),
            order_ts=ts,
        ))
    return pd.DataFrame(rows)


def gen_order_items(orders: pd.DataFrame, n_products: int) -> pd.DataFrame:
    rng = random.Random(SEED + 3)
    rows = []
    iid = 1
    for _, o in orders.iterrows():
        n_items = rng.randint(1, 5)
        chosen = rng.sample(range(1, n_products + 1), k=n_items)
        for pid in chosen:
            rows.append(dict(
                item_id=iid,
                order_id=int(o["order_id"]),
                product_id=pid,
                quantity=rng.randint(1, 5),
                unit_price=round(rng.uniform(10, 5000), 2),
            ))
            iid += 1
    return pd.DataFrame(rows)


def gen_user_events(n: int, n_users: int) -> pd.DataFrame:
    rng = random.Random(SEED + 4)
    rows = []
    start = datetime(2024, 1, 1)
    for i in range(1, n + 1):
        ts = start + timedelta(
            days=rng.randint(0, 364),
            seconds=rng.randint(0, 86_400),
        )
        rows.append(dict(
            event_id=i,
            user_id=rng.randint(1, n_users),
            event_type=rng.choice(EVENT_TYPES),
            page=rng.choice(["home", "list", "detail", "cart", "pay"]),
            event_ts=ts,
        ))
    return pd.DataFrame(rows)


def write_parquet(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(df), path)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--scale", default="small", choices=list(SCALES))
    args = p.parse_args()

    cfg = SCALES[args.scale]
    out = Path("data") / args.scale
    out.mkdir(parents=True, exist_ok=True)

    print(f"[generate] scale={args.scale} cfg={cfg}")
    users = gen_users(cfg["users"])
    products = gen_products(cfg["products"])
    orders = gen_orders(cfg["orders"], cfg["users"])
    items = gen_order_items(orders, cfg["products"])
    events = gen_user_events(cfg["events"], cfg["users"])

    write_parquet(users, out / "users.parquet")
    write_parquet(products, out / "products.parquet")
    write_parquet(orders, out / "orders.parquet")
    write_parquet(items, out / "order_items.parquet")
    write_parquet(events, out / "user_events.parquet")

    # Build a DuckDB file as a convenience for the SQL contract tests.
    db = out / "warehouse.duckdb"
    con = duckdb.connect(str(db))
    con.execute("CREATE SCHEMA IF NOT EXISTS ods")
    for name, df in [
        ("users", users), ("products", products), ("orders", orders),
        ("order_items", items), ("user_events", events),
    ]:
        con.execute(f"DROP TABLE IF EXISTS ods.{name}")
        con.register(f"_{name}", df)
        con.execute(f"CREATE TABLE ods.{name} AS SELECT * FROM _{name}")
    con.close()

    sizes = {f.stem: f.stat().st_size for f in out.glob("*.parquet")}
    print(f"[generate] wrote to {out}: {sizes}")


if __name__ == "__main__":
    main()
