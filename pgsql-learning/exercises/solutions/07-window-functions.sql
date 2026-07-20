-- Solutions 07
SET search_path = sql_core, public;
DROP TABLE IF EXISTS orders_w CASCADE;
CREATE TABLE orders_w (customer_id int, placed_at timestamptz, total numeric(12,2));
INSERT INTO orders_w VALUES (1,'2025-06-01',10),(1,'2025-06-02',30),(2,'2025-06-01',50),(2,'2025-06-02',40);

SELECT customer_id, placed_at, total,
       row_number()      OVER (PARTITION BY customer_id ORDER BY placed_at) AS rn,
       sum(total)        OVER (PARTITION BY customer_id ORDER BY placed_at) AS rt,
       dense_rank()      OVER (PARTITION BY customer_id ORDER BY total DESC)  AS rk,
       coalesce(lag(total)  OVER (PARTITION BY customer_id ORDER BY placed_at), 0) AS prev,
       coalesce(lead(total) OVER (PARTITION BY customer_id ORDER BY placed_at), 0) AS next
  FROM orders_w
 ORDER BY customer_id, placed_at;
