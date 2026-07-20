-- Module 06 — Aggregates and Grouping
\echo === Module 06: Aggregates and Grouping ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS visits CASCADE;
CREATE TABLE visits (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visitor_id    bigint NOT NULL,
    page          text   NOT NULL,
    session_id    bigint NOT NULL,
    visited_at    timestamptz NOT NULL DEFAULT now(),
    duration_sec  integer NOT NULL
);
INSERT INTO visits (visitor_id, page, session_id, duration_sec) VALUES
 (1, '/home',   10, 12),
 (1, '/about',  10, 33),
 (1, '/home',   11,  4),
 (2, '/home',   20, 60),
 (2, '/cart',   20, 90),
 (3, '/home',   30,  8),
 (3, '/checkout',30,120);

-- 6.1 Standard aggregates
SELECT count(*) AS n_rows,
       count(DISTINCT visitor_id) AS n_visitors,
       count(DISTINCT session_id) AS n_sessions,
       sum(duration_sec) AS total_seconds,
       avg(duration_sec)::numeric(10,2) AS mean_seconds,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_sec) AS p50,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_sec) AS p95
  FROM visits;

-- 6.2 GROUP BY with FILTER (per-spec aggregate filter)
SELECT page,
       count(*) FILTER (WHERE duration_sec >= 30) AS long_visits,
       count(*) FILTER (WHERE duration_sec <  30) AS short_visits,
       avg(duration_sec) AS mean_dur
  FROM visits
 GROUP BY page
 ORDER BY page;

-- 6.3 ORDER BY in aggregates
SELECT mode() WITHIN GROUP (ORDER BY page) AS most_common_page
  FROM visits;

-- 6.4 GROUPING SETS, ROLLUP, CUBE
SELECT page, count(*)
  FROM visits
 GROUP BY GROUPING SETS ((page), ());

SELECT page, count(*)
  FROM visits
 GROUP BY ROLLUP (page)
 ORDER BY page NULLS LAST;
-- ROLLUP(p) emits (NULL), (p1), (p2), ..., (NULL)
-- ROLLUP((a,b)) emits (NULL,NULL), (a,b), (a), ()
-- ROLLUP(a,b) emits (NULL,NULL), (a,b), (a), (NULL)

SELECT page, count(*)
  FROM visits
 GROUP BY CUBE (page)
 ORDER BY page NULLS LAST;
-- CUBE(N cols) emits all 2^N subtotals.

-- 6.5 HAVING: predicate applied to a group
SELECT visitor_id,
       count(*) AS n_visits,
       sum(duration_sec) AS total
  FROM visits
 GROUP BY visitor_id
HAVING sum(duration_sec) > 60
 ORDER BY total DESC;

-- 6.6 Aggregate + ORDER BY without GROUP BY gives one row; ORDER BY must reference an aggregate.
SELECT max(duration_sec), min(duration_sec)
  FROM visits;

-- 6.7 Boolean aggregates
SELECT bool_and(duration_sec > 0) AS all_positive,
       bool_or(duration_sec > 60)  AS any_long
  FROM visits;

-- 6.8 jsonb_agg/array_agg with ORDER BY
SELECT visitor_id, jsonb_agg(jsonb_build_object('page', page, 'dur', duration_sec) ORDER BY visited_at) AS trail
  FROM visits
 GROUP BY visitor_id
 ORDER BY visitor_id;

\echo === Module 06 complete ===
