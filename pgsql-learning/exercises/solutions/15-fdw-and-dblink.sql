-- Solutions 15
SET search_path = sql_core, public;
CREATE EXTENSION IF NOT EXISTS file_fdw;
CREATE SERVER IF NOT EXISTS fileserver FOREIGN DATA WRAPPER file_fdw;

DROP FOREIGN TABLE IF EXISTS csv_read;
CREATE FOREIGN TABLE csv_read (sku text, region text, amount numeric(12,2))
    SERVER fileserver
    OPTIONS (filename '/workspace/modules/15-fdw-and-dblink/data/sales.csv', format 'csv', header 'true');

SELECT * FROM csv_read;
