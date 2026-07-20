-- Module 09 — Subqueries and LATERAL
\echo === Module 09: Subqueries and LATERAL ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS customers, orders CASCADE;
CREATE TABLE customers (
    id bigint PRIMARY KEY,
    name text NOT NULL,
    region text NOT NULL
);
CREATE TABLE orders (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  bigint REFERENCES customers(id),
    total        numeric(12,2) NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO customers VALUES
 (1,'Alice','EU'),
 (2,'Bob',  'US'),
 (3,'Carol','EU'),
 (4,'Dave', 'APAC');
INSERT INTO orders (customer_id, total) VALUES
 (1, 10.00),
 (1, 30.00),
 (1, 50.00),
 (2, 12.00),
 (2,  8.00),
 (3,  9.00),
 (4,100.00);

-- 9.1 Scalar subquery
SELECT name,
       (SELECT max(total) FROM orders WHERE customer_id = c.id) AS max_order
  FROM customers c;

-- 9.2 EXISTS — semi-join
SELECT name FROM customers c
 WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- 9.3 NOT EXISTS — anti-join
SELECT name FROM customers c
 WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- 9.4 IN with a subquery
SELECT name FROM customers
 WHERE id IN (SELECT customer_id FROM orders WHERE total > 25);

-- 9.5 FROM-side subquery
SELECT region, sum(region_total)
  FROM (
        SELECT c.region, o.total AS region_total
          FROM customers c JOIN orders o ON o.customer_id = c.id
  ) j
 GROUP BY region;

-- 9.6 Correlated subquery in SELECT (per-row aggregate)
SELECT c.name,
       (SELECT round(avg(o.total)::numeric, 2) FROM orders o WHERE o.customer_id = c.id) AS avg_total
  FROM customers c;

-- 9.7 LATERAL: top-2 orders per customer
SELECT c.name, l.id AS order_id, l.total
  FROM customers c
  LEFT JOIN LATERAL (
        SELECT id, total
          FROM orders o
         WHERE o.customer_id = c.id
         ORDER BY total DESC
         LIMIT 2
  ) l ON true;

-- 9.8 ANY / ALL with subqueries
SELECT name FROM customers
 WHERE id = ANY (
       SELECT customer_id FROM orders GROUP BY customer_id HAVING count(*) >= 3
 );
SELECT name FROM customers
 WHERE id <> ALL (
       SELECT customer_id FROM orders WHERE total < 20
 );

-- 9.9 Lateral with grouping sets
SELECT c.name, l.ym, l.total
  FROM customers c
  LEFT JOIN LATERAL (
        SELECT to_char(created_at, 'YYYY-MM') AS ym, sum(total) AS total
          FROM orders
         WHERE customer_id = c.id
         GROUP BY ym
         ORDER BY ym DESC
         LIMIT 1
  ) l ON true;

\echo === Module 09 complete ===
