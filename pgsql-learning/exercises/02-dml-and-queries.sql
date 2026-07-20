-- Exercise 02 — DML and Queries
SET search_path = sql_core, public;

DROP TABLE IF EXISTS ex02;
CREATE TABLE ex02 (id serial PRIMARY KEY, sku text UNIQUE, name text, price numeric(12,2));

INSERT INTO ex02 (sku, name, price) VALUES ('A','A',10),('B','B',20),('C','C',30);

-- Q1: Upsert a row for SKU 'D' priced 5, then UPDATE its price to 7 if it exists already.

-- Q2: Write a MERGE that from a staging table s (sku text, new_price numeric) sets
--     ex02.price = s.new_price when matched, inserts when not.

-- Q3: Return all rows ordered by price desc, NULLs last.
