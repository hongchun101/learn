-- Module 24 — Extensions and pgvector
\echo === Module 24: Extensions and pgvector ===
SET search_path = sql_core, public;

\echo === 24.1 Installed extensions ===
SELECT extname, extversion FROM pg_extension ORDER BY extname;

\echo === 24.2 Available extensions (catalog only) ===
SELECT name, default_version, installed_version FROM pg_available_extensions ORDER BY name LIMIT 25;

\echo === 24.3 Useful contrib extensions ===
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS hstore;

\echo === 24.4 pgvector: extension not bundled with alpine by default; install if available ===
DO $$ BEGIN
    BEGIN
        EXECUTE 'CREATE EXTENSION vector';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pgvector not available: install separately; continuing.';
    END;
END $$;

\echo === 24.5 If pgvector is available, create a vector column ===
DO $$ BEGIN
    BEGIN
        EXECUTE 'DROP TABLE IF EXISTS docs CASCADE;
                 CREATE TABLE docs (
                   id bigint PRIMARY KEY,
                   body text NOT NULL,
                   embedding vector(3)
                 )';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping vector table: extension missing.';
    END;
END $$;

\echo === 24.6 Trigram indexes for fuzzy text search ===
DROP TABLE IF EXISTS docs_txt CASCADE;
CREATE TABLE docs_txt (id bigint PRIMARY KEY, body text);
INSERT INTO docs_txt VALUES (1,'alpha'),(2,'beta'),(3,'alphabet');
CREATE INDEX docs_txt_trgm ON docs_txt USING gin (body gin_trgm_ops);

SELECT id, body
  FROM docs_txt
 WHERE body % 'alphbet'
 ORDER BY similarity(body, 'alphbet') DESC;

\echo === 24.7 pg_trgm with `<->>` similarity ===
SELECT body <-> 'alpha' AS dist
  FROM docs_txt
 ORDER BY dist
 LIMIT 5;

\echo === Module 24 complete ===
