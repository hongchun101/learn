-- Solutions 02 — DML
SET search_path = sql_core, public;

-- Q1
INSERT INTO ex02 (sku, name, price) VALUES ('D','D',5)
ON CONFLICT (sku) DO UPDATE SET price = 7;

-- Q2
BEGIN;
CREATE TEMP TABLE s (sku text, new_price numeric(12,2)) ON COMMIT DROP;
INSERT INTO s VALUES ('A', 11), ('B', 22);
MERGE INTO ex02 o USING s ON o.sku = s.sku
 WHEN MATCHED THEN UPDATE SET price = s.new_price
 WHEN NOT MATCHED THEN INSERT (sku, name, price) VALUES (s.sku, s.sku, s.new_price);
COMMIT;
SELECT * FROM ex02;

-- Q3
SELECT * FROM ex02 ORDER BY price DESC NULLS LAST;
