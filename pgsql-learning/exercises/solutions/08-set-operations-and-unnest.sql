-- Solutions 08
SET search_path = sql_core, public;
SELECT 1 AS a UNION ALL SELECT 1;

SELECT generate_series(1,5) UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7;
-- returns 1,2,3,4,5,5,6,7

SELECT u.* FROM unnest(ARRAY[10,20,30]) WITH ORDINALITY AS u(value, ord);
