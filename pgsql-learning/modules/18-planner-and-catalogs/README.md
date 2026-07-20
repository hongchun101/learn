# 18 — Planner and System Catalogs

## Goal

You can read `pg_class`, `pg_stats`, `pg_statistic`, extended stats, and
adjust cost GUCs to nudge the planner.

## Contracts

- **Contract 1 (re-check)** — `EXPLAIN (ANALYZE, BUFFERS)` on a real query.
- **Contract 3 (re-check)** — `pg_class` is the relation catalog.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/18-planner-and-catalogs/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 18.1 | `pg_class` | Tables, indexes, views, sequences |
| 18.2 | `pg_stats` (readable view over `pg_statistic`) | n_distinct, MCVs, histogram |
| 18.3 | cost GUCs | `seq_page_cost`, `random_page_cost`, etc. |
| 18.4 | Override cost | `SET LOCAL …` then re-EXPLAIN |
| 18.5 | cross-column extended stats | `CREATE STATISTICS` |
| 18.6 | multi-column dependency detection | `mcv`, `histogram`, `ndistinct` lists |

## Mental model

- The planner cost model is a **system of equations**, not a formula you
  tweak at one knob. Plan regressions usually indicate a stats /
  cardinality problem, not a GUC problem.
- `random_page_cost` is the single knob that controls "index vs seq
  scan". On SSDs (low random read cost), lowering it below `seq_page_cost`
  makes the planner prefer indexes more often.
- Extended stats (`CREATE STATISTICS`) are how you feed multi-column
  correlations into the planner. Always ANALYZE the table after
  creating them.
- `pg_statistic` is binary; read it through `pg_stats`.

## Tables you'll cite in your sleep

| Catalog | What it lists |
|---------|---------------|
| `pg_class`     | relations: tables, indexes, views, sequences |
| `pg_attribute` | columns and types |
| `pg_type`      | data types |
| `pg_proc`      | functions |
| `pg_namespace` | schemas |
| `pg_index`     | indexes + meta |
| `pg_statistic` | stats: MCVs, histograms, correlation |
| `pg_constraint`| constraints |
| `pg_trigger`   | triggers |
| `pg_inherits`  | partitioning + inheritance |
| `pg_depend`    | dependency graph |

## Exercises

See `exercises/18-planner-and-catalogs.sql`.
