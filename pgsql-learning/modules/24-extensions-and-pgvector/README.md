# 24 — Extensions and pgvector

## Goal

You can install extensions, ship fuzzy text search, and stand up a
vector search workload with pgvector.

## Contracts

- `pg_available_extensions` lists installable extensions.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/24-extensions-and-pgvector/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 24.1 | `pg_extension`, `pg_available_extensions` | Catalog |
| 24.2 | Useful contrib | `pg_trgm`, `citext`, `hstore`, `fuzzystrmatch` |
| 24.3 | Fuzzy text search | `GIN (body gin_trgm_ops)`, `<->>`, similarity |
| 24.4 | pgvector install | Separate docker image or `postgresql-pgvector` package |
| 24.5 | `vector(n)` column | Always declare the dimension |
| 24.6 | HNSW vs IVFFLAT | Both available; default `vector_cosine_ops` |

## Mental model

- `pg_trgm` works well for typos and short text. Threshold-based, not a
  ranking model.
- pgvector + HNSW gives sub-millisecond nearest-neighbour lookup at the
  cost of a fairly large index.
- Always declare the *exact* vector dimension. Mismatch = query-time
  cast errors.

## Exercises

See `exercises/24-extensions-and-pgvector.sql`.
