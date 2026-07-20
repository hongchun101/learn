-- Module 03 — Joins
\echo === Module 03: Joins ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS customers, orders, products, order_items CASCADE;

CREATE TABLE customers (
    id   bigint PRIMARY KEY,
    name text NOT NULL
);
CREATE TABLE orders (
    id            bigint PRIMARY KEY,
    customer_id   bigint REFERENCES customers(id),
    placed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE products (
    id     bigint PRIMARY KEY,
    sku    text NOT NULL UNIQUE,
    price  numeric(12,2) NOT NULL
);
CREATE TABLE order_items (
    order_id    bigint REFERENCES orders(id),
    product_id  bigint REFERENCES products(id),
    qty         integer NOT NULL,
    PRIMARY KEY (order_id, product_id)
);

INSERT INTO customers VALUES (1,'Alice'),(2,'Bob'),(3,'Carol');
INSERT INTO products   VALUES (10,'SKU-A',1.00),(20,'SKU-B',2.00),(30,'SKU-C',3.00);
INSERT INTO orders     VALUES (100,1, now()),(101,1, now()),(102,2, now()),(103,NULL, now());
INSERT INTO order_items VALUES
 (100,10,5),(100,20,1),
 (101,10,2),(101,30,3),
 (102,20,7);

-- 3.1 INNER JOIN
SELECT c.name, count(*) AS n_orders
  FROM customers c
  JOIN orders o ON o.customer_id = c.id
 GROUP BY c.name
 ORDER BY n_orders DESC;

-- 3.2 LEFT JOIN with anti-join pattern
SELECT c.name
  FROM customers c
  LEFT JOIN orders o ON o.customer_id = c.id
 WHERE o.id IS NULL;
-- Rows where the right side is NULL after a LEFT JOIN are the *anti* set.

-- 3.3 FULL OUTER JOIN and handling both NULLs
SELECT coalesce(c.name,'(no customer)') AS name,
       coalesce(o.id::text, '(no order)') AS oid
  FROM customers c
  FULL OUTER JOIN orders o ON o.customer_id = c.id
 ORDER BY c.name NULLS LAST;

-- 3.4 CROSS JOIN
SELECT s.suffix
  FROM generate_series(1,3) s(suffix)
 CROSS JOIN customers c;

-- 3.5 LATERAL — top-3 products per customer (a per-row correlated subquery).
SELECT c.name, l.product_id, l.qty
  FROM customers c
  LEFT JOIN LATERAL (
        SELECT oi.product_id, sum(oi.qty) AS qty
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
         WHERE o.customer_id = c.id               -- reference the outer table
         GROUP BY oi.product_id
         ORDER BY qty DESC
         LIMIT 3
  ) l ON true;

-- 3.6 Self-join — for each order, the previous order by the same customer.
SELECT o.customer_id, o.id, prev.id AS prev_order_id
  FROM orders o
  LEFT JOIN LATERAL (
        SELECT id
          FROM orders
         WHERE customer_id = o.customer_id
           AND placed_at < o.placed_at
         ORDER BY placed_at DESC
         LIMIT 1
  ) prev ON true;

-- 3.7 USING vs ON
SELECT *
  FROM orders o
  JOIN customers USING (id)
 LIMIT 1;
-- USING collapses the join columns into one column. ON keeps them separate.

\echo === Module 03 complete ===
