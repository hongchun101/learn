-- Solutions 22
SELECT pid, state, now() - query_start AS dur, left(query, 80) AS q
  FROM pg_stat_activity
 WHERE state IS NOT NULL
 ORDER BY query_start;

\echo --- Slow-query log captured in pg_stat_statements below
SELECT substring(query for 80), calls, round(mean_exec_time::numeric,1) AS mean_ms
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC LIMIT 5;
