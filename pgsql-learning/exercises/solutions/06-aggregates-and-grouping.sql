-- Solutions 06
SET search_path = sql_core, public;
DROP TABLE IF EXISTS visits CASCADE;
CREATE TABLE visits (visitor_id int, page text, duration_sec int);
INSERT INTO visits VALUES (1,'/a',10),(1,'/a',60),(2,'/a',5),(2,'/b',90);

-- Q1
SELECT page,
       count(*) AS visits_total,
       count(*) FILTER (WHERE duration_sec >= 30) AS long_visits,
       avg(duration_sec) AS mean_dur
  FROM visits
 GROUP BY page;

-- Q2
SELECT page, count(*)
  FROM visits
 GROUP BY ROLLUP (page);

-- Q3
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_sec) AS median
  FROM visits;
