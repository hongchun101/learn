-- Capstone — pgvector semantic search over reviews (Module 24).
-- Runs only if pgvector is installed; otherwise it prints a notice and exits.
SET search_path = shop, public;

-- Check pgvector availability and set a psql variable
SELECT CASE
    WHEN EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector')
    THEN 'on'
    ELSE 'off'
END AS pgvector_ok
\gset

\echo === 6.0 pgvector availability check ===
SELECT :'pgvector_ok' AS pgvector_ok;

\if :pgvector_ok
\echo === pgvector is available; running 6.1–6.3 ===

-- Create the embeddings table
DROP TABLE IF EXISTS shop.review_embeddings;
CREATE TABLE shop.review_embeddings (
    review_id bigint PRIMARY KEY REFERENCES shop.reviews(id) ON DELETE CASCADE,
    embedding vector(8) NOT NULL
);

-- Populate embeddings deterministically (one row per review).
-- 8 dimensions is enough to demonstrate the API; real workloads
-- use 384, 768, or 1536.
INSERT INTO shop.review_embeddings (review_id, embedding)
SELECT r.id,
       ARRAY[
         r.rating::float / 5.0,
         length(r.body)::float / 1000.0,
         ('x' || substr(md5(r.body), 1, 1))::bit(8)::int::float / 256.0,
         ('x' || substr(md5(r.body), 2, 1))::bit(8)::int::float / 256.0,
         ('x' || substr(md5(r.body), 3, 1))::bit(8)::int::float / 256.0,
         ('x' || substr(md5(r.body), 4, 1))::bit(8)::int::float / 256.0,
         ('x' || substr(md5(r.body), 5, 1))::bit(8)::int::float / 256.0,
         ('x' || substr(md5(r.body), 6, 1))::bit(8)::int::float / 256.0
       ]::vector(8)
  FROM shop.reviews r
 ON CONFLICT (review_id) DO NOTHING;

ANALYZE shop.review_embeddings;

\echo === 6.1 HNSW index on the embedding column ===
CREATE INDEX IF NOT EXISTS review_embeddings_hnsw_idx
    ON shop.review_embeddings USING hnsw (embedding vector_cosine_ops);

\echo === 6.2 5-NN query for a sample review ===
WITH q AS (
    SELECT embedding FROM shop.review_embeddings ORDER BY review_id LIMIT 1
)
SELECT re.review_id, r.body, r.rating,
       re.embedding <=> (SELECT embedding FROM q) AS distance
  FROM shop.review_embeddings re
  JOIN shop.reviews r ON r.id = re.review_id
 ORDER BY re.embedding <=> (SELECT embedding FROM q)
 LIMIT 5;

\echo === 6.3 EXPLAIN — verify HNSW index is used ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT review_id
  FROM shop.review_embeddings
 ORDER BY embedding <=> (SELECT embedding FROM shop.review_embeddings LIMIT 1)
 LIMIT 5;

\else

\echo === pgvector not available; skipping 6.1–6.3 (this is fine — pgvector is an optional extension) ===

\endif

\echo === Module 06 (pgvector) complete ===
