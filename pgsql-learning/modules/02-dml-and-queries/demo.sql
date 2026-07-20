-- Module 02 — DML and queries
-- SELECT, INSERT, UPDATE, DELETE, MERGE, ON CONFLICT, returning.
\echo === Module 02: DML and Queries ===
SET search_path = sql_core, public;
DROP TABLE IF EXISTS orders, customers, addresses, line_items, big_orders, legs, measured, old_measurement CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS orders   CASCADE;

CREATE TABLE products (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku          text NOT NULL UNIQUE,
    name         text NOT NULL,
    price        numeric(12, 2) NOT NULL CHECK (price >= 0),
    stock        integer NOT NULL DEFAULT 0,
    discontinued boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  bigint NOT NULL,
    status       text   NOT NULL CHECK (status IN ('pending','paid','shipped','cancelled')),
    total        numeric(12, 2),
    created_at   timestamptz NOT NULL DEFAULT now(),
    closed_at    timestamptz
);

-- 2.1 INSERT + ON CONFLICT
INSERT INTO products (sku, name, price, stock) VALUES
 ('SKU-A','Apple',   0.99, 100),
 ('SKU-B','Banana',  0.59, 50),
 ('SKU-C','Cherry',  4.99,  5)
ON CONFLICT (sku) DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock
RETURNING id, sku, (xmax = 0) AS inserted, xmax;
-- RETURNING can emit whether the row was *inserted* (xmax=0) or updated.

-- 2.2 DISTINCT / DISTINCT ON
INSERT INTO products (sku, name, price) VALUES
 ('SKU-D','Durian', 9.99),
 ('SKU-E','Elder',  3.49),
 ('SKU-F','Fig',    2.49);

SELECT DISTINCT ON (length(name)) length(name) AS len, name
  FROM products
 ORDER BY length(name);
-- DISTINCT ON keeps one row per unique value in the column list.

-- 2.3 ORDER BY + NULLS
INSERT INTO orders (customer_id, status, total) VALUES
 (1, 'paid',    199.99),
 (2, 'paid',     99.50),
 (1, 'paid',     99.50),
 (3, 'pending',   0.00),
 (1, 'shipped',   0.00);

-- A SECOND insert with NULL total to exercise NULLS LAST semantics.
INSERT INTO orders (customer_id, status, total) VALUES
 (3, 'cancelled', NULL);

SELECT customer_id, total
  FROM orders
 ORDER BY total DESC NULLS LAST, customer_id;
-- NULLS LAST/FIRST controls position; default is NULLS LAST for DESC, NULLS FIRST for ASC.
SELECT DISTINCT customer_id, total
  FROM orders
 ORDER BY total DESC NULLS LAST;

-- 2.4 UPDATE ... FROM
UPDATE orders o
   SET status = 'shipped', closed_at = now()
  FROM products p
 WHERE p.sku = 'SKU-A'
   AND o.customer_id = 1
   AND o.status = 'paid';

-- 2.5 DELETE ... USING and RETURNING
DELETE FROM products
 WHERE sku = 'SKU-F'
RETURNING id, sku;
-- RETURNING is required if you want to know which rows you deleted.

-- 2.6 MERGE: row-conditional insert/update/delete
DROP TABLE IF EXISTS price_updates CASCADE;
CREATE TABLE price_updates (sku text PRIMARY KEY, new_price numeric(12,2));

INSERT INTO price_updates(sku, new_price) VALUES
 ('SKU-A', 1.19),
 ('SKU-C', 4.49),
 ('SKU-X', 5.00);
DELETE FROM price_updates WHERE sku = 'SKU-A' AND new_price = 9.99;

MERGE INTO products p
     USING price_updates u
        ON p.sku = u.sku
       AND NOT p.discontinued
WHEN MATCHED THEN
     UPDATE SET price = u.new_price
WHEN NOT MATCHED THEN
     INSERT (sku, name, price, stock) VALUES (u.sku, 'New from MERGE', u.new_price, 0);

SELECT sku, name, price FROM products WHERE sku IN ('SKU-A','SKU-C','SKU-X');

-- 2.7 Returning aggregates in a DML
WITH new_orders AS (
    INSERT INTO orders (customer_id, status, total)
    VALUES (4, 'paid', 12.34), (5, 'paid', 56.78)
    RETURNING *
)
SELECT count(*) AS n, sum(total) AS total FROM new_orders;
-- CTE INSERT...RETURNING makes a DML enumerable like a SELECT.

\echo === Module 02 complete ===
