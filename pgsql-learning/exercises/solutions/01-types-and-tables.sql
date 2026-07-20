-- Solutions 01 — Types and Tables
SET search_path = sql_core, public;

-- Q1
SELECT title, weight
  FROM ex01
 WHERE tag = 'greeting'
 ORDER BY weight DESC;

-- Q2
SELECT title, meta ->> 'lang' AS lang
  FROM ex01
 WHERE meta @> '{"lang":"en"}';

-- Q3
SELECT * FROM ex01 WHERE tag = ANY (ARRAY['greeting','farewell']);
