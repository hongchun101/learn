-- Module 10 — EXPLAIN and ANALYZE
-- Reads the plan tree fluently.
\echo === Module 10: EXPLAIN and ANALYZE ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS products_10 CASCADE;
CREATE TABLE products_10 AS
    SELECT gs AS id,
           'sku-' || gs                           AS sku,
           (random() * 1000)::numeric(12,2)       AS price,
           (random() * 100)::int                  AS stock,
           (random() * 5)::int                    AS category_id
      FROM generate_series(1, 100000) gs;

ANALYZE products_10;
-- ANALYZE samples and stores per-column statistics into pg_statistic.

\echo === 10.1 EXPLAIN (no analysis) ===
EXPLAIN SELECT * FROM products_10 WHERE price < 1.00;
-- Without ANALYZE, the planner still uses stats; with no ANALYZE yet, it'll fall back to defaults.

\echo === 10.2 EXPLAIN ANALYZE (run the query) ===
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, TIMING)
SELECT * FROM products_10 WHERE price < 1.00;

\echo === 10.3 EXPLAIN ANALYZE on an aggregation ===
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT category_id, count(*), avg(price)
  FROM products_10
 GROUP BY category_id;

\echo === 10.4 Hash join plan vs Nested Loop ===
DROP TABLE IF EXISTS a_10, b_10 CASCADE;
CREATE TABLE a_10 AS SELECT gs AS id FROM generate_series(1, 1000) gs;
CREATE TABLE b_10 AS SELECT gs AS id, md5(gs::text) AS s FROM generate_series(1, 1000) gs;
ANALYZE a_10; ANALYZE b_10;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM a_10 JOIN b_10 USING (id)
 WHERE a_10.id < 5;

\echo === 10.5 Mis-estimation example: correlated vs random column ===
DROP TABLE IF EXISTS skewed CASCADE;
CREATE TABLE skewed AS
  SELECT gs AS id,
         case when random() < 0.9 then 'common' else 'rare' end AS bucket
    FROM generate_series(1, 100000) gs;
ANALYZE skewed;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM skewed WHERE bucket = 'rare';

\echo === 10.6 EXPLAIN with FORMAT JSON ===
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT count(*) FROM products_10 WHERE price < 100;

\echo === Module 10 complete ===
