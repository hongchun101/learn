# 11 — Indexes

## Goal

You can choose the right access method (btree, hash, GIN, GiST, BRIN,
SP-GiST) for any query pattern, ship a covering index without breaking
writes, and inspect the actual usage of every index.

## Contracts

- **Contract 3** — `pg_class.relkind = 'i'`.
- Index choice: every predicate whose plan should be **index-driven** must
  be matched against the access method's strengths.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/11-indexes/demo.sql
```

## Concepts

| Section | Access method | Best for |
|---------|---------------|----------|
| 11.1 | btree (default) | equality, range, ORDER BY, NULLs |
| 11.2 | composite btree | left-prefix equality + range |
| 11.3 | GIN | jsonb containment, full-text, arrays |
| 11.4 | GIN over `text[]` | `@>` containment |
| 11.5 | BRIN | append-only time-series, sparse writes |
| 11.6 | expression | predicate on a function result |
| 11.7 | partial | hot subset of a large table |
| 11.8 | hash | equality-only (rare; btree handles equality) |
| 11.9 | covering | Index-Only Scan; `INCLUDE` |
| 11.10 | pg_stat_user_indexes | Inspect usage |

## Mental model

- **btree** is what you reach for first. It handles equality, range, ORDER
  BY, NULLs, and composite left prefixes.
- **GIN** is a build-then-probe structure; you pay on write, gain search
  over multi-valued columns.
- **BRIN** is a small per-range summary; it's *only* a win when values are
  physically clustered (e.g. append-only, sorted inserts).
- **Hash** was a write-once-read-many option that no longer outperforms
  btree. Use btree unless you measure.
- **Partial** + **expression** indexes are often the highest-impact
  choices in real apps.
- **INCLUDE** turns an index into a covering index: it satisfies the
  query without visiting the heap, **if** the visibility map says the
  page is all-visible.

## Exercises

See `exercises/11-indexes.sql`.
