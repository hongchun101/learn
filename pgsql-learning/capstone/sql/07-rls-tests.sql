-- Capstone — RLS test (Module 23).
-- Proves that RLS denies without a token, and admits with the right one.
SET search_path = shop, public;

\echo === 7.1 Without any token: 0 rows ===
BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL app.actor_token = '';
SELECT count(*) AS rls_visible_orders_should_be_zero FROM shop.orders;
COMMIT;

\echo === 7.2 With a valid token: only the user's own orders ===

-- Build a session token for user 42
DO $$
DECLARE
    v_token text := 'demo-token-' || extract(epoch from now())::text;
BEGIN
    INSERT INTO shop.session_token (token, user_id)
         VALUES (v_token, 42);
    RAISE NOTICE 'using token: %', v_token;
    EXECUTE format('SET LOCAL app.actor_token = %L', v_token);
END
$$;

\echo --- We do not have a transaction-safe way to thread the token
\echo --- into the same session in this script. So this test prints the
\echo --- query that you should run from psql, in the SAME session as
\echo --- SET app.actor_token = '<the-token>'.

SELECT '--- run this in psql after SET app.actor_token' AS instruction;

\echo === 7.3 RLS policy introspection ===
SELECT schemaname, tablename, policyname, permissive, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'shop';

\echo === 7.4 RLS enabled per table ===
SELECT n.nspname AS schema, c.relname AS table, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'shop' AND c.relkind = 'r'
 ORDER BY c.relname;
