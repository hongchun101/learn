-- Solutions 24
SET search_path = sql_core, public;
DROP TABLE IF EXISTS docs CASCADE;
CREATE TABLE docs (id bigint PRIMARY KEY, body text);
INSERT INTO docs VALUES (1,'alpha'),(2,'beta'),(3,'alphabet');
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX docs_trgm ON docs USING gin (body gin_trgm_ops);

SELECT body, similarity(body, 'alphbet') AS s
  FROM docs
 ORDER BY s DESC
 LIMIT 5;
