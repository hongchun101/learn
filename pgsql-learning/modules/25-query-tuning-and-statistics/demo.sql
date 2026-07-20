-- Module 25 — Query Tuning and Statistics
\echo === Module 25: Query Tuning and Statistics ===
SET search_path = sql_core, public;

\echo === 25.1 Inspect fine-grained cost model ===
SHOW random_page_cost;
SHOW seq_page_cost;
SHOW effective_cache_size;
SHOW work_mem;

\echo === 25.2 Re-tune planning for SSD ===
SET random_page_cost = 1.1;          -- close to seq_page_cost for SSD

\echo === 25.3 Use a small bench table ===
DROP TABLE IF EXISTS bench;
CREATE TABLE bench AS
    SELECT gs AS id,
           (gs % 1000)             AS bucket,
           (random() * 1000)::int  AS amount
      FROM generate_series(1, 1000000) gs;
ANALYZE bench;

\echo === 25.4 Run with and without index; observe plan changes ===
EXPLAIN ANALYZE
SELECT * FROM bench WHERE bucket = 42;

CREATE INDEX bench_bucket_idx ON bench (bucket);
EXPLAIN ANALYZE
SELECT * FROM bench WHERE bucket = 42;

\echo === 25.5 Statistics target ===
ALTER TABLE bench ALTER COLUMN bucket SET STATISTICS 1000;
ANALYZE bench;
SELECT most_common_vals, most_common_freqs
  FROM pg_stats
 WHERE tablename = 'bench' AND attname = 'bucket';

\echo === 25.6 n_distinct and join selectivity ===
SELECT n_distinct,
       correlation,
       null_frac
  FROM pg_stats
 WHERE tablename = 'bench' AND attname = 'amount';

\echo === 25.7 Skewed data: detect mis-estimation ===
DROP TABLE IF EXISTS skewed_25 CASCADE;
CREATE TABLE skewed_25 AS
    SELECT CASE WHEN random() < 0.9 THEN 'common' ELSE 'rare' END AS bucket,
           g AS id,
           (random()*100)::int AS n
      FROM generate_series(1, 100000) g;
ANALYZE skewed_25;

EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM skewed_25 WHERE bucket = 'rare';

\echo === 25.8 Extended stats fix the mis-estimation ===
CREATE STATISTICS skewed_25_stats (dependencies) ON bucket, n FROM skewed_25;
ANALYZE skewed_25;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM skewed_25 WHERE bucket = 'rare' AND n < 5;

\echo === 25.9 planner hint via pg_hint_plan (extension-based) ===
\echo --- not bundled with stock alpine; usually pg_hint_plan is a separate package

\echo === Module 25 complete ===
