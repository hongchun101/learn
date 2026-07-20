# 01 — Types and Tables

## Goal

You can model any domain with PostgreSQL types: numbers, text, dates, JSON,
arrays, ranges, enums, composites, domains.

## Contracts

- **None** — this module introduces the type system that every other module
  assumes.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/01-types-and-tables/demo.sql
```

## Concepts

| Section | Concept | Operator |
|---------|---------|----------|
| 1.1     | base types       | integer, numeric(p,s), double precision, text/char(N), boolean |
| 1.2     | temporal         | date, time, timestamptz, tstzrange |
| 1.3     | JSON / JSONB     | `@>`, `?`, `->`, `->>`, `#>` |
| 1.4     | arrays           | `[]`, `ANY`, `unnest`, `array_agg` |
| 1.5     | network          | `inet`, `cidr`, `macaddr8` |
| 1.6     | range            | `int4range`, `daterange`, `tstzrange` |
| 1.7     | ENUM             | `CREATE TYPE ... AS ENUM (...)` |
| 1.8     | composite        | `CREATE TYPE ... AS (...)` |
| 1.9     | DOMAIN           | `CREATE DOMAIN ... AS ... CHECK (...)` |

## Mental model

- `numeric(p, s)` — exact, *no* rounding; `decimal` is an alias. Use for money.
- `real` / `double precision` — IEEE 754; never store money in them.
- `text` vs `varchar(n)` — `varchar(n)` with a length is decorative; it does
  not save space the way `char(n)` does; `text` is the recommended choice.
- `jsonb` vs `json` — `jsonb` is decomposed + binary; always prefer it.
- `ENUM` — saves bytes by storing a fixed-width 4-byte reference rather than
  the label, and supports indexes.
- `DOMAIN` — a CHECK-wrapped type with a real name; useful for showing
  intent and getting nice error messages.
- `composite type` — a tuple with a name; usable as a column type. Mostly a
  storage detail; pragmatic `jsonb` is preferred in modern codebases.

## Exercises

See `exercises/01-types-and-tables.sql`.
