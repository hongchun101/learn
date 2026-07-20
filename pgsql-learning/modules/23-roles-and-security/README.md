# 23 — Roles and Security

## Goal

You can grant the minimal privilege, enable RLS, and read `pg_hba.conf`.

## Contracts

- `pg_hba_file_rules` lists every auth line in `pg_hba.conf`.

## Run

```bash
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/modules/23-roles-and-security/demo.sql
```

## Concepts

| Section | Concept | Note |
|---------|---------|------|
| 23.1 | `pg_roles` | users, groups, superuser status |
| 23.2 | Predefined roles: pg_read_all_data, pg_write_all_data | PG 14+ roles |
| 23.3 | RLS | `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, `CREATE POLICY` |
| 23.4 | Column-level GRANT | `GRANT SELECT (col)` |
| 23.5 | `pg_hba.conf` types | `trust`, `md5`, `scram-sha-256`, `peer`, `cert` |
| 23.6 | `SET ROLE` | Switch roles within a session |
| 23.7 | pgAudit | Audit log; install via package |

## Mental model

- PostgreSQL privileges are **per object**; the canonical operation is
  `GRANT <priv> ON <obj> TO <role>`.
- RLS policies are applied **after** the privilege check: an RLS-disabled
  row is invisible to the user even if they own the row.
- `pg_hba.conf` order matters: the first matching rule wins; keep it
  strictest-first.
- `SCRAM-SHA-256` is the default since PG 10; avoid `md5` for new deploys.

## Exercises

See `exercises/23-roles-and-security.sql`.
