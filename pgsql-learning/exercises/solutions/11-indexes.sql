-- Solutions 11
SET search_path = sql_core, public;
DROP TABLE IF EXISTS products_11_ex CASCADE;
CREATE TABLE products_11_ex (LIKE sql_core.products_11 INCLUDING ALL);
INSERT INTO products_11_ex SELECT * FROM sql_core.products_11 LIMIT 10000;
ANALYZE products_11_ex;

-- Q1
CREATE INDEX p11_name_btree ON products_11_ex (name);
EXPLAIN SELECT * FROM products_11_ex WHERE name = 'p_77';

-- Q2
CREATE INDEX p11_fruit_price ON products_11_ex (price) WHERE category='fruit';

-- Q3
CREATE INDEX p11_cat_price_inc ON products_11_ex (category, price) INCLUDE (name);
VACUUM (ANALYZE) products_11_ex;
EXPLAIN SELECT name FROM products_11_ex WHERE category = 'fruit' AND price < 5;
