-- Module 07 — Window Functions
\echo === Module 07: Window Functions ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS orders_w CASCADE;
CREATE TABLE orders_w (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  bigint NOT NULL,
    placed_at    timestamptz NOT NULL,
    total        numeric(12,2) NOT NULL
);
INSERT INTO orders_w (customer_id, placed_at, total) VALUES
 (1, '2025-06-01 10:00+00', 10.00),
 (1, '2025-06-02 10:00+00', 12.00),
 (1, '2025-06-05 10:00+00', 99.00),
 (2, '2025-06-01 10:00+00', 50.00),
 (2, '2025-06-10 10:00+00', 60.00),
 (3, '2025-06-01 10:00+00',  1.00);

-- 7.1 ROW_NUMBER, RANK, DENSE_RANK
SELECT customer_id, total, placed_at,
       row_number() OVER (PARTITION BY customer_id ORDER BY placed_at) AS row_num,
       rank()       OVER (PARTITION BY customer_id ORDER BY total DESC)        AS rnk,
       dense_rank() OVER (PARTITION BY customer_id ORDER BY total DESC)        AS dense
  FROM orders_w
 ORDER BY customer_id, placed_at;

-- 7.2 First / last per partition
SELECT DISTINCT ON (customer_id)
       customer_id,
       first_value(total) OVER (PARTITION BY customer_id ORDER BY placed_at
                                ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS first_total,
       last_value(total)  OVER (PARTITION BY customer_id ORDER BY placed_at
                                ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_total
  FROM orders_w
 ORDER BY customer_id;

-- 7.3 Running sum (rows unbounded preceding)
SELECT customer_id, placed_at, total,
       sum(total) OVER (PARTITION BY customer_id ORDER BY placed_at
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
  FROM orders_w
 ORDER BY customer_id, placed_at;

-- 7.4 Sliding 2-row window
SELECT customer_id, placed_at, total,
       avg(total) OVER (PARTITION BY customer_id ORDER BY placed_at
                        ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS sliding_avg
  FROM orders_w
 ORDER BY customer_id, placed_at;

-- 7.5 Named window: WINDOW clause eliminates duplication
SELECT customer_id, placed_at, total,
       sum(total)        OVER w AS running_total,
       avg(total)        OVER w AS running_avg,
       count(*)          OVER w AS running_count,
       max(total)        OVER w AS running_max,
       row_number()      OVER w AS row_num
  FROM orders_w
WINDOW w AS (PARTITION BY customer_id ORDER BY placed_at
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
 ORDER BY customer_id, placed_at;

-- 7.6 ntile + percent_rank
SELECT customer_id, total,
       ntile(4) OVER (ORDER BY total DESC) AS quartile,
       percent_rank() OVER (ORDER BY total) AS pct_rank,
       cume_dist()    OVER (ORDER BY total) AS cum_dist
  FROM orders_w;

-- 7.7 LAG / LEAD with default
SELECT customer_id, placed_at, total,
       lag(total,  1, 0) OVER w AS prev_total,
       lead(total, 1, 0) OVER w AS next_total
  FROM orders_w
WINDOW w AS (PARTITION BY customer_id ORDER BY placed_at)
 ORDER BY customer_id, placed_at;

-- 7.8 Frame exclusion (PG ≥ 14)
SELECT customer_id, placed_at, total,
       sum(total) OVER (PARTITION BY customer_id ORDER BY placed_at
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        EXCLUDE CURRENT ROW) AS excl_curr
  FROM orders_w
 ORDER BY customer_id, placed_at;

\echo === Module 07 complete ===
