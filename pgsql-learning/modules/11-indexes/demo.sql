-- Module 11 — Indexes
-- This is the module that decides whether every query in your app is
-- fast or slow. Read the README first; the contract is *which* access
-- method backs your predicate.
\echo === Module 11: Indexes ===
SET search_path = sql_core, public;
DROP TABLE IF EXISTS products_11 CASCADE;
CREATE TABLE products_11 (
    id          bigserial PRIMARY KEY,
    name        text NOT NULL,
    category    text NOT NULL,
    sku         text NOT NULL UNIQUE,
    price       numeric(12,2) NOT NULL,
    attributes  jsonb NOT NULL DEFAULT '{}',
    tags        text[] NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO products_11 (name, category, sku, price, attributes, tags)
SELECT
    'p_' || gs,
    (array['fruit','veg','dairy','meat'])[1 + (gs % 4)],
    'sku-' || gs,
    (random() * 100)::numeric(12,2),
    jsonb_build_object('popularity', random(), 'rating', (random() * 5)::numeric(3,2)),
    array[(array['red','green','blue','organic'])[1 + (gs % 4)],
          (array['fresh','imported','local'])[1 + (gs % 3)]]::text[]
  FROM generate_series(1, 100000) gs;
ANALYZE products_11;

\echo === 11.1 Plain B-tree ===
CREATE INDEX products_11_category_idx ON products_11 (category);
EXPLAIN SELECT * FROM products_11 WHERE category = 'fruit' LIMIT 1;

\echo === 11.2 Composite index ===
CREATE INDEX products_11_category_price_idx ON products_11 (category, price);
EXPLAIN SELECT * FROM products_11 WHERE category = 'fruit' ORDER BY price LIMIT 1;

\echo === 11.3 GIN on jsonb ===
CREATE INDEX products_11_attrs_gin ON products_11 USING gin (attributes);
EXPLAIN SELECT * FROM products_11 WHERE attributes @> '{"popularity": 1}' LIMIT 1;

\echo === 11.4 GIN on text[] ===
CREATE INDEX products_11_tags_gin ON products_11 USING gin (tags);
EXPLAIN SELECT * FROM products_11 WHERE tags @> ARRAY['red']::text[] LIMIT 1;

\echo === 11.5 BRIN on time-series ===
CREATE INDEX products_11_brin ON products_11 USING brin (created_at);
-- BRIN keeps a min/max per block range; works for naturally clustered append-only data.

\echo === 11.6 Expression index ===
CREATE INDEX products_11_lower_name_idx ON products_11 (lower(name));
EXPLAIN SELECT * FROM products_11 WHERE lower(name) = 'p_77' LIMIT 1;

\echo === 11.7 Partial index ===
CREATE INDEX products_11_active_price_idx ON products_11 (price)
  WHERE category = 'fruit';

\echo === 11.8 Hash index (equality only) ===
CREATE INDEX products_11_name_hash ON products_11 USING hash (name);
EXPLAIN SELECT * FROM products_11 WHERE name = 'p_77';

\echo === 11.9 Covering index (Index-Only Scan) ===
-- Index includes columns to satisfy the SELECT without heap fetch.
CREATE INDEX products_11_cat_price_inc ON products_11 (category, price) INCLUDE (name, sku);

VACUUM (ANALYZE) products_11;       -- advances visibility map; required for IOS
EXPLAIN SELECT name, sku FROM products_11 WHERE category = 'fruit' AND price < 5.0 LIMIT 1;

\echo === 11.10 Inspect index usage and dead tuples ===
SELECT schemaname, relname, indexrelname,
       idx_scan, idx_tup_read, idx_tup_fetch
  FROM pg_stat_user_indexes
 WHERE relname = 'products_11';

SELECT c.relname AS tbl, n_live_tup, n_dead_tup,
       pg_size_pretty(pg_relation_size(c.oid)) AS size
  FROM pg_stat_user_tables t
  JOIN pg_class c ON c.oid = t.relid
 WHERE c.relname = 'products_11';

\echo === Module 11 complete ===
