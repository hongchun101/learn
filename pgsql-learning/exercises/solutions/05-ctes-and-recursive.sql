-- Solutions 05
SET search_path = sql_core, public;
DROP TABLE IF EXISTS sales CASCADE, employees CASCADE;
CREATE TABLE sales(id bigint, amt numeric(12,2), day date);
INSERT INTO sales VALUES (1,10,'2025-06-01'),(2,20,'2025-06-01'),(3,15,'2025-06-02');
CREATE TABLE employees(id bigint, name text, manager_id bigint);
INSERT INTO employees VALUES (1,'CEO',NULL),(2,'CTO',1),(3,'Eng1',2);

-- Q1
WITH per_day AS (
  SELECT day, sum(amt) AS day_total FROM sales GROUP BY day
)
SELECT day, day_total,
       sum(day_total) OVER (ORDER BY day) AS running_total
  FROM per_day
 ORDER BY day;

-- Q2
WITH RECURSIVE org(id, name, manager_id, depth) AS (
    SELECT id, name, manager_id, 1 FROM employees WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.name, e.manager_id, o.depth + 1
      FROM employees e JOIN org o ON e.manager_id = o.id
)
SELECT repeat('  ', depth - 1) || name AS chain, depth FROM org;

-- Q3
WITH RECURSIVE org(id, name, manager_id, path, cycle) AS (
    SELECT id, name, manager_id, ARRAY[id], false FROM employees WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.name, e.manager_id, o.path || e.id, e.id = ANY(o.path)
      FROM employees e JOIN org o ON e.manager_id = o.id
     WHERE NOT o.cycle
)
SELECT * FROM org WHERE cycle;
