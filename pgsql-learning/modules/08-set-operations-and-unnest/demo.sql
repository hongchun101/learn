-- Module 08 — Set Operations and UNNEST
\echo === Module 08: Set Operations and UNNEST ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS customers_us, customers_eu CASCADE;
CREATE TABLE customers_us (
    id bigint, name text
);
CREATE TABLE customers_eu (
    id bigint, name text
);
INSERT INTO customers_us VALUES (1,'Alice'),(2,'Bob');
INSERT INTO customers_eu VALUES (2,'Bob'),(3,'Carol');

-- 8.1 UNION (deduplicates) vs UNION ALL (preserves duplicates).
SELECT id, name FROM customers_us
UNION
SELECT id, name FROM customers_eu;

SELECT id, name FROM customers_us
UNION ALL
SELECT id, name FROM customers_eu;

-- 8.2 INTERSECT, EXCEPT
SELECT id, name FROM customers_us
INTERSECT
SELECT id, name FROM customers_eu;

SELECT id, name FROM customers_us
EXCEPT
SELECT id, name FROM customers_eu;

-- 8.3 Type rules: set ops need matching columns types and either compatible
-- collation / type, or explicit casts.

-- 8.4 UNNEST: turn an array into rows.
SELECT unnest(array[10,20,30,40]) AS x;

SELECT u.*
  FROM (VALUES (ARRAY['red','green','blue'])) AS t(colors)
  , LATERAL unnest(t.colors) AS u(color);
-- LATERAL is required when nesting unnest inside a query with other FROM items that define context.

-- 8.5 UNNEST with WITH ORDINALITY — adds a position column.
SELECT u.*
  FROM unnest(array['red','green','blue']) WITH ORDINALITY AS u(color, ord);

-- 8.6 jsonb_array_elements: rows from a JSON array.
SELECT v->>'product' AS product, (v->>'qty')::int AS qty
  FROM (VALUES ('[{"product":"a","qty":1}, {"product":"b","qty":3}]'::jsonb)) AS t(arr),
       LATERAL jsonb_array_elements(t.arr) AS v;

-- 8.7 ARRAY constructor and array aggregation.
DROP TABLE IF EXISTS items;
CREATE TABLE items (g text, v integer);
INSERT INTO items VALUES ('a', 1), ('a', 2), ('a', 3), ('b', 5), ('b', 6);

SELECT g, array_agg(v ORDER BY v) AS vs, array_agg(DISTINCT v ORDER BY v) AS uniq_vs
  FROM items
 GROUP BY g;

-- 8.8 EXCEPT with WHERE
SELECT id FROM generate_series(1, 5) g(id)
EXCEPT
SELECT id FROM generate_series(3, 7) g(id);

\echo === Module 08 complete ===
