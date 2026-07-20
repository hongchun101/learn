# SQL Contract — Invariants

Every module in this curriculum is expected to produce a warehouse
that satisfies these invariants on the shared demo dataset. The
invariants are stated independently of any particular SQL dialect;
each module's tests instantiate them in that engine's SQL.

## I.1 Source-to-ODS

For every business event, exactly one row exists in `ods.<table>`.

```sql
SELECT COUNT(*) FROM ods.orders;
-- I.1.a  must equal the number of input rows
```

## I.2 ODS-to-DWD: cleaning

For every row in `ods.orders`, exactly one row exists in
`dwd.orders` after cleaning (dedup, type cast, conformed status).

```sql
SELECT
  (SELECT COUNT(*) FROM ods.orders)  AS raw,
  (SELECT COUNT(*) FROM dwd.orders)  AS dwd;
-- I.2.a  raw >= dwd (some rows may be deduped)
-- I.2.b  every dwd.order_id exists in ods.orders
```

## I.3 DWD-to-DWS: aggregate

For every (`user_id`, `dt`) in `dwd.orders` there is at most one row
in `dws.user_order_1d`, and the day's `order_amount` matches the sum
of `total` over that day's `dwd.orders`.

```sql
SELECT
  SUM(CASE WHEN dws.order_amount = dwd_sum.sum_total THEN 1 ELSE 0 END)
  / COUNT(*) AS match_rate
FROM dws.user_order_1d dws
JOIN (
  SELECT user_id, order_date AS dt, SUM(total) AS sum_total
  FROM dwd.orders
  GROUP BY user_id, order_date
) dwd_sum
ON dws.user_id = dwd_sum.user_id AND dws.dt = dwd_sum.dt;
-- I.3.a  match_rate = 1.0
```

## I.4 SCD-2 dimension integrity

For every dimension that uses SCD-2, exactly one row per
`natural_key` is "current" (`valid_to = '9999-12-31'`).

```sql
SELECT natural_key, COUNT(*)
FROM dim_user_scd2
WHERE valid_to = DATE '9999-12-31'
GROUP BY natural_key
HAVING COUNT(*) > 1;
-- I.4.a  zero rows
```

## I.5 Referential integrity

Every `user_id` in `dwd.orders` exists in `dim_user`.

```sql
SELECT COUNT(*)
FROM dwd.orders o
LEFT JOIN dim_user d ON o.user_id = d.user_id
WHERE d.user_id IS NULL;
-- I.5.a  zero rows
```

## I.6 Idempotency

Running the ODS → DWD pipeline twice produces the same row count in
`dwd.orders`.

```
run  ->  dwd_count = N
rerun ->  dwd_count = N
```

## I.7 Late-arriving data

A record with `order_ts` earlier than the current max in `dwd.orders`
must still land in `dwd.orders` with the correct `dt` partition
(partition = `order_date`, not `load_date`).

```sql
SELECT MAX(order_ts) FROM ods.orders;
SELECT MAX(dt) FROM dwd.orders;
-- I.7.a  max(order_ts) from ods == max(dt) from dwd
```

## I.8 End-to-end reconciliation

`sum(dwd.orders.total) == sum(dws.user_order_1d.order_amount) ==
sum(ads.gmv_daily.gmv)`.

```sql
WITH
  a AS (SELECT SUM(total) AS s FROM dwd.orders),
  b AS (SELECT SUM(order_amount) AS s FROM dws.user_order_1d),
  c AS (SELECT SUM(gmv) AS s FROM ads.gmv_daily)
SELECT a.s, b.s, c.s FROM a, b, c;
-- I.8.a  all three equal
```

## I.9 Real-time: append-only stream

A streaming pipeline reading from `ods.user_events` and writing to
`dwd.user_events` must process every event **at least once** and
**deduplicate by `event_id`** (at-most-once after dedup = exactly-once
logically).

```sql
SELECT COUNT(DISTINCT event_id) FROM dwd.user_events;
-- I.9.a  equals COUNT(*) FROM ods.user_events
```

## I.10 Lakehouse: snapshot isolation

Reading a snapshot of `dws.user_order_1d` twice within the same
transaction returns the same row count and the same sums.

```sql
BEGIN;
SELECT COUNT(*), SUM(order_amount) FROM dws.user_order_1d;
-- (concurrent writer commits)
SELECT COUNT(*), SUM(order_amount) FROM dws.user_order_1d;
COMMIT;
-- I.10.a  both reads return identical values
```

## Engine-by-engine implementation

| Engine | Where the invariant is checked |
|---|---|
| DuckDB (reference) | `sql-contract/reference_duckdb.sql` + `tests/test_contracts_duckdb.py` |
| Hive | `modules/05-hive/tests/test_contracts.py` |
| Spark | `modules/06-spark/tests/test_contracts.py` |
| Trino | `modules/02-sql-advanced/tests/test_trino_contracts.py` |
| Flink | `modules/11-flink-sql-cdc/tests/test_contracts.py` |
| Iceberg (Spark/Trino/Flink) | `modules/13-data-lake/tests/test_contracts.py` |

A learner who has implemented all ten invariants in two different
engines can be confident they understand the warehouse, not just
the dialect.
