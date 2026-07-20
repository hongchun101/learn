-- Module 26 — Locking and Deadlocks
\echo === Module 26: Locking and Deadlocks ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS accounts;
CREATE TABLE accounts (id int PRIMARY KEY, balance bigint NOT NULL);
INSERT INTO accounts VALUES (1, 1000), (2, 2000), (3, 3000);

\echo === 26.1 Row-level FOR UPDATE ===
\echo --- would normally run in two sessions; we illustrate syntax.

\echo --- session 1:
-- BEGIN;
-- SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
-- SELECT pg_sleep(2);  -- imagine IO
-- COMMIT;

\echo === 26.2 FOR NO KEY UPDATE vs FOR UPDATE (PG 9.x+) ===
\echo --- FOR NO KEY UPDATE does not block FK enforcement on the row.
\echo --- FOR UPDATE does block any concurrent modification.

\echo === 26.3 FOR KEY SHARE / FOR SHARE ===
\echo --- FOR SHARE blocks FOR UPDATE; FK triggers take FOR KEY SHARE.

\echo === 26.4 NOWAIT / SKIP LOCKED ===
\echo --- SELECT * FROM accounts FOR UPDATE SKIP LOCKED;       -- skip busy rows
\echo --- SELECT * FROM accounts FOR UPDATE NOWAIT;           -- fail fast with 55P03

\echo === 26.5 Lock view ===
SELECT 'active locks' AS check, count(*) FROM pg_locks;

\echo === 26.6 advisory lock ===
SELECT pg_advisory_lock(1);
SELECT pg_advisory_lock(1, 2);
SELECT pg_advisory_unlock(1);
SELECT pg_advisory_unlock(1, 2);
-- Advisory locks are application-keyed and not transactional unless wrapped.

\echo === 26.7 advisory lock with transaction ===
BEGIN;
SELECT pg_advisory_xact_lock(99);
-- Lock released at COMMIT/ROLLBACK.
COMMIT;

\echo === 26.8 Deadlock detection ===
\echo --- Postgres detects deadlock -> aborts one transaction with 40P01.
\echo --- Run two psql sessions; both: BEGIN; UPDATE accounts SET balance = balance + 1 WHERE id = X; UPDATE ... WHERE id = Y; COMMIT.

SELECT 'currently waiting' AS info, count(*) FROM pg_locks WHERE NOT granted;

\echo === Module 26 complete ===
