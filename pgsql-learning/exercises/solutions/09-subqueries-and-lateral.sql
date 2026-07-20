-- Solutions 09
SET search_path = sql_core, public;
DROP TABLE IF EXISTS c, o CASCADE;
CREATE TABLE c (id int, region text);
CREATE TABLE o (customer_id int, total numeric(12,2), created_at timestamptz);
INSERT INTO c VALUES (1,'EU'),(2,'US'),(3,'EU');
INSERT INTO o VALUES (1,10,now()),(1,20,now()),(2,30,now());

-- Q1
SELECT region, (SELECT count(*) FROM o WHERE customer_id IN (SELECT id FROM c WHERE region=c2.region)) AS n
  FROM c c2
 GROUP BY region;

-- Q2
SELECT region FROM c
 WHERE NOT EXISTS (SELECT 1 FROM o WHERE o.customer_id = c.id);

-- Q3
SELECT c.region, l.total
  FROM c
  LEFT JOIN LATERAL (
        SELECT o.total
          FROM o WHERE o.customer_id = c.id
         ORDER BY o.total DESC
         LIMIT 1
  ) l ON true;
