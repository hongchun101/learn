import duckdb

con = duckdb.connect(":memory:")
DATA = r"D:/work/project/learn/datawarehouse-learning/data/small"
for f in ["orders", "order_items", "products", "users", "user_events"]:
    print(f)
    rows = con.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{DATA}/{f}.parquet')"
    ).fetchall()
    for r in rows:
        print(" ", r)
    print("  count:", con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{DATA}/{f}.parquet')"
    ).fetchone()[0])