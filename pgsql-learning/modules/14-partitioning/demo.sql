-- Module 14 — Partitioning
\echo === Module 14: Partitioning ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS sales CASCADE;

\echo === 14.1 RANGE partitioning by month ===
CREATE TABLE sales (
    id          bigint GENERATED ALWAYS AS IDENTITY,
    sold_on     date   NOT NULL,
    region      text   NOT NULL,
    amount      numeric(12,2) NOT NULL,
    PRIMARY KEY (sold_on, id)
) PARTITION BY RANGE (sold_on);

CREATE TABLE sales_2025_01 PARTITION OF sales
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE sales_2025_02 PARTITION OF sales
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE sales_2025_03 PARTITION OF sales
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE INDEX sales_2025_01_region_idx ON sales_2025_01 (region);
-- Per-partition indexes are normal.
CREATE INDEX sales_2025_02_region_idx ON sales_2025_02 (region);
CREATE INDEX sales_2025_03_region_idx ON sales_2025_03 (region);

INSERT INTO sales (sold_on, region, amount)
SELECT date '2025-01-15' + (gs || ' days')::interval,
       (array['EU','US','APAC'])[1 + (gs % 3)],
       (random() * 100)::numeric(12,2)
  FROM generate_series(1, 60) gs;

EXPLAIN SELECT sum(amount) FROM sales WHERE sold_on BETWEEN '2025-02-01' AND '2025-02-28';
\echo --- partition pruning in effect when EXPLAIN touches only one partition.

\echo === 14.2 LIST partitioning by region ===
DROP TABLE IF EXISTS traffic CASCADE;
CREATE TABLE traffic (
    id bigint,
    region text NOT NULL,
    payload jsonb
) PARTITION BY LIST (region);

CREATE TABLE traffic_eu  PARTITION OF traffic FOR VALUES IN ('EU');
CREATE TABLE traffic_us  PARTITION OF traffic FOR VALUES IN ('US','US-CA','US-NY');
CREATE TABLE traffic_apa PARTITION OF traffic FOR VALUES IN ('APAC');

INSERT INTO traffic VALUES (1,'EU','{}'::jsonb),(2,'US-CA','{}'::jsonb),(3,'APAC','{}'::jsonb);

\echo === 14.3 HASH partitioning ===
DROP TABLE IF EXISTS events CASCADE;
CREATE TABLE events (
    id bigint,
    payload jsonb
) PARTITION BY HASH (id);

CREATE TABLE events_0 PARTITION OF events FOR VALUES WITH (MODULUS 3, REMAINDER 0);
CREATE TABLE events_1 PARTITION OF events FOR VALUES WITH (MODULUS 3, REMAINDER 1);
CREATE TABLE events_2 PARTITION OF events FOR VALUES WITH (MODULUS 3, REMAINDER 2);

INSERT INTO events SELECT g, '{}'::jsonb FROM generate_series(1, 30) g;

\echo === 14.4 Detach and reattach a partition ===
ALTER TABLE sales DETACH PARTITION sales_2025_03;
ALTER TABLE sales ATTACH PARTITION sales_2025_03
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

\echo === 14.5 Default partition catches out-of-range ===
CREATE TABLE sales_default PARTITION OF sales DEFAULT;
INSERT INTO sales (sold_on, region, amount) VALUES ('2099-01-01','EU',1.0) RETURNING *;

\echo === 14.6 See how many partitions of `sales` exist ===
SELECT c.relname AS partition_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS size
  FROM pg_inherits i
  JOIN pg_class c ON c.oid = i.inhrelid
 WHERE inhparent = 'sql_core.sales'::regclass
 ORDER BY c.relname;

\echo === Module 14 complete ===
