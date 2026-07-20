-- Solutions 16
SET search_path = sql_core, public;
CREATE EXTENSION IF NOT EXISTS pageinspect;

DROP TABLE IF EXISTS t_16 CASCADE;
CREATE TABLE t_16 (id int);
INSERT INTO t_16 VALUES (1),(2);

SELECT *
  FROM heap_page_items(get_raw_page('t_16', 0));

-- 2 RC transactions in two psql sessions show different views.
