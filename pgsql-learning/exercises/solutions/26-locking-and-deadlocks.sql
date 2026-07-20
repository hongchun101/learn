-- Solutions 26
SET search_path = sql_core, public;
DROP TABLE IF EXISTS rows CASCADE;
CREATE TABLE rows(id int PRIMARY KEY);
INSERT INTO rows VALUES (1),(2);

\echo --- Open two psql sessions, do:
\echo --- TX-A: BEGIN; UPDATE rows SET id = id WHERE id = 1; (do not commit)
\echo --- TX-B: BEGIN; UPDATE rows SET id = id WHERE id = 2; UPDATE rows SET id = id WHERE id = 1; (blocks, awaits A)
\echo --- Now in TX-A: UPDATE rows SET id = id WHERE id = 2; (deadlock -> 40P01)

SELECT pg_try_advisory_lock(7);
SELECT pg_advisory_unlock(7);
