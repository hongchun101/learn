# 04 — DDL and Constraints

## Goal

You can write any DDL: tables with identity PK, FK with cascading actions,
CHECKs, compound CHECKs, GENERATED columns, deferred constraints, and
constraint migration patterns that don't lock a busy table.

## Contracts

- **Contract 3** — every relation appears in `pg_class`.
- We re-check `pg_class` after this module.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/04-ddl-and-constraints/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 4.1 | `GENERATED ... AS IDENTITY` | The standard way to declare auto-incrementing PK. |
| 4.2 | FK with `ON DELETE/UPDATE` | CASCADE / SET NULL / SET DEFAULT / RESTRICT / NO ACTION. |
| 4.3 | CHECK constraints | Single-column and compound (`CONSTRAINT ... CHECK (...)`). |
| 4.4 | `GENERATED ... AS ... STORED` | Computed columns whose value lives on the page. |
| 4.5 | Partial unique index | See module 11. |
| 4.6 | Table inheritance | Deprecation: exists for compatibility, don't use. |
| 4.7 | `DEFERRABLE` constraint | Constraints checked at COMMIT, not at row write. |
| 4.8 | `NOT VALID` + `VALIDATE` | Add a constraint without `ACCESS EXCLUSIVE` lock. |

## Mental model

- `GENERATED ALWAYS AS IDENTITY` is the future; `serial` works but is just
  sugar for `nextval` on a sequence.
- `STORED` GENERATED columns are physical. They cannot be virtual yet.
- `NOT VALID` + `VALIDATE CONSTRAINT` is the canonical pattern for adding
  an FK to a 1 TB table: add it not valid, validate in a separate
  transaction, no long lock.
- `DEFERRABLE INITIALLY IMMEDIATE`: the constraint *may* be deferred if
  the transaction says so. Use `SET CONSTRAINTS ALL DEFERRED` inside the
  transaction.

## Exercises

See `exercises/04-ddl-and-constraints.sql`.
