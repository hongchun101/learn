-- Exercise 03 — Joins
SET search_path = sql_core, public;

DROP TABLE IF EXISTS c, o;
CREATE TABLE c (id int PRIMARY KEY, name text);
CREATE TABLE o (id int PRIMARY KEY, customer_id int REFERENCES c(id), total int);
INSERT INTO c VALUES (1,'alice'),(2,'bob'),(3,'carol');
INSERT INTO o VALUES (10,1,100),(20,1,50),(30,2,40);

-- Q1: Show all customers with their order totals, including customers with no orders.
-- Q2: Show only customers with no orders.
-- Q3: Use LATERAL to find each customer's single largest order total.
