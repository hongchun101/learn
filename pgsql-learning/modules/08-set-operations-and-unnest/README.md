# 08 — Set Operations and UNNEST

## Goal

You can deduplicate, intersect, and subtract bag-similar data with set
ops, and turn arrays or JSON arrays into rows.

## Contracts

- **None.**

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/08-set-operations-and-unnest/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 8.1 | `UNION` / `UNION ALL` | Dedup vs not |
| 8.2 | `INTERSECT` / `EXCEPT` | Set ops on bags |
| 8.3 | Type rules | Same number of columns + compatible types |
| 8.4 | `unnest(array)` | Rows from an array |
| 8.5 | `WITH ORDINALITY` | Position column |
| 8.6 | `jsonb_array_elements` | JSON array → rows |
| 8.7 | `array_agg(ORDER BY)` | Build arrays from rows |
| 8.8 | Set op + `generate_series` | Patterns for fully synthetic queries |

## Mental model

- Set ops **deduplicate** by default. Use `UNION ALL` to skip the
  deduplication step (faster, preserves rows).
- `EXCEPT` removes from the LEFT set the rows that appear in the RIGHT
  set. `INTERSECT` keeps only the matching bag-similar rows.
- `UNNEST(arr)` is a *set-returning function*. Combined with `WITH
  ORDINALITY`, you get positional info. Combined with `LATERAL`, you can
  iterate over a per-row array.

## Exercises

See `exercises/08-set-operations-and-unnest.sql`.
