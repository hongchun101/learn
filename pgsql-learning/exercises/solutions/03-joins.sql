-- Solutions 03
SET search_path = sql_core, public;

-- Q1
SELECT c.name, sum(o.total) AS total
  FROM c LEFT JOIN o ON o.customer_id = c.id
 GROUP BY c.name;

-- Q2
SELECT c.name FROM c
 WHERE NOT EXISTS (SELECT 1 FROM o WHERE o.customer_id = c.id);

-- Q3
SELECT c.name, l.total
  FROM c
  LEFT JOIN LATERAL (
        SELECT o.total
          FROM o WHERE o.customer_id = c.id
         ORDER BY o.total DESC
         LIMIT 1
  ) l ON true;
