-- Module 23 — Roles and Security
\echo === Module 23: Roles and Security ===
SET search_path = sql_core, public;

\echo === 23.1 Built-in roles ===
SELECT rolname, rolsuper, rolcanlogin, rolcreaterole
  FROM pg_roles WHERE rolcanlogin ORDER BY rolname;

\echo === 23.2 Read-only analyst role ===
DO $$ BEGIN
  BEGIN
    EXECUTE 'CREATE ROLE analyst_ro LOGIN PASSWORD ''analyst_ro''';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
GRANT pg_read_all_data TO analyst_ro;
-- pg_read_all_data (PG14+): read access to every object.

\echo === 23.3 Row-Level Security ===
DROP TABLE IF EXISTS orders_rls CASCADE;
CREATE TABLE orders_rls (
    id bigint PRIMARY KEY,
    region text NOT NULL,
    total numeric(12,2)
);
INSERT INTO orders_rls VALUES (1, 'EU', 100), (2, 'US', 200), (3, 'EU', 50);

ALTER TABLE orders_rls ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_eu_only ON orders_rls
    USING (region = current_setting('app.region', true));
\echo --- would need to SET app.region at runtime; we simulate:
SELECT current_setting('app.region', true);

\echo === 23.4 Column-level permissions ===
DROP TABLE IF EXISTS payments CASCADE;
CREATE TABLE payments (
    id           bigint PRIMARY KEY,
    -- sensitive column: granted only to billing
    card_number  text NOT NULL,
    amount       numeric(12,2) NOT NULL
);
INSERT INTO payments VALUES (1,'****-****-****-1234', 9.99), (2,'****-****-****-5678', 19.99);
REVOKE ALL ON payments FROM PUBLIC;
GRANT SELECT (id, amount), UPDATE (amount) ON payments TO app_reader;
GRANT ALL ON payments TO app_writer;

\echo === 23.5 pg_hba.conf: trust / md5 / scram-sha-256 / peer / cert ===
SHOW hba_file;
SELECT type, database, user_name, auth_method, address
  FROM pg_hba_file_rules
 WHERE database IS NOT NULL
 ORDER BY line_number;

\echo === 23.6 Set role + privileges  ===
GRANT app_writer TO postgres;
SET ROLE app_writer;
SELECT current_user, session_user;
RESET ROLE;

\echo === 23.7 Audit log: install pgaudit via package; we conditional-fall-through here ===
DO $$ BEGIN
    BEGIN
        EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgaudit';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pgaudit not installed; skipping.';
    END;
END $$;

\echo === Module 23 complete ===
