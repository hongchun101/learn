-- Loaded by docker-entrypoint-initdb.d when the cluster is first initialised.
-- Anything that needs to exist *before* modules run goes here.

\echo === pgsql-learning seed schema ===

-- Extension required by module 22 monitoring + capstone ops.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- One schema per part to keep unrelated exercises from colliding.
CREATE SCHEMA IF NOT EXISTS sql_core;
CREATE SCHEMA IF NOT EXISTS advanced;
CREATE SCHEMA IF NOT EXISTS internals;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS perf;

-- Roles used by modules that need privilege escalation or read-only replicas.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_writer') THEN
    CREATE ROLE app_writer LOGIN PASSWORD 'app_writer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_reader') THEN
    CREATE ROLE app_reader LOGIN PASSWORD 'app_reader';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analyst') THEN
    CREATE ROLE analyst LOGIN PASSWORD 'analyst';
  END IF;
END $$;

GRANT USAGE ON SCHEMA sql_core, advanced, internals, ops, perf TO PUBLIC;
GRANT pg_read_all_data TO app_reader;
ALTER ROLE app_reader SET statement_timeout = '5s';

\echo === seed ok ===
