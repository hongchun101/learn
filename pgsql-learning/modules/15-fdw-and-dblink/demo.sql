-- Module 15 — FDW and dblink
\echo === Module 15: FDW and dblink ===
SET search_path = sql_core, public;

-- 15.1 file_fdw: read CSV on disk.
CREATE EXTENSION IF NOT EXISTS file_fdw;
DROP FOREIGN TABLE IF EXISTS sales_csv;
CREATE SERVER IF NOT EXISTS fileserver FOREIGN DATA WRAPPER file_fdw;
CREATE FOREIGN TABLE sales_csv (
    sku      text,
    region   text,
    amount   numeric(12,2)
) SERVER fileserver
OPTIONS (filename '/workspace/modules/15-fdw-and-dblink/data/sales.csv', format 'csv', header 'true');

\echo --- (create file if absent)
SELECT * FROM sales_csv LIMIT 5;

\echo === 15.2 foreign table from another database (postgres_fdw) ===

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- We're a single node here; we declare a server pointed at the primary's
-- replica identity (host = primary in compose). The query below only runs if
-- that replica is reachable; otherwise, we *show* the syntax.

\echo --- (syntax example only)
-- CREATE SERVER analytics FOREIGN DATA WRAPPER postgres_fdw
--   OPTIONS (host 'replica', port '5432', dbname 'learning');
-- CREATE USER MAPPING FOR current_user SERVER analytics
--   OPTIONS (user 'postgres', password 'postgres');
-- CREATE FOREIGN TABLE remote_sales (
--   id bigint, sku text, amount numeric
-- ) SERVER analytics OPTIONS (table_name 'sales_15');

\echo === 15.3 dblink: query a remote DB inline ===
CREATE EXTENSION IF NOT EXISTS dblink;

-- Example: pull a single row through a one-shot connection.
-- dblink() returns a setof record; you must name columns in FROM.
-- SELECT t.*
--   FROM dblink('dbname=learning user=postgres host=primary',
--               'SELECT now()') AS t(now_ts timestamptz);

\echo === 15.4 Push-down with postgres_fdw (cost_remote_*) ===
-- The planner considers cost_remote_* settings when deciding whether to
-- fetch all rows and join locally, or to send the join to the remote side.
-- We exercise the GUCs:

SHOW fsync;
SHOW enable_partitionwise_join;

\echo === Module 15 complete ===
