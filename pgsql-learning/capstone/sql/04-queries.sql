-- Capstone — query suite, exercises the contracts.
SET search_path = shop, public;

-- 1) Today, who placed the most orders? EXPLAIN to prove indexing.
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, count(*) AS n
  FROM shop.orders
 WHERE placed_at >= current_date
 GROUP BY user_id
 ORDER BY n DESC
 LIMIT 5;

-- 2) Top 3 products by GMV per region.
SELECT region,
       (array_agg(json_build_object('product_id', product_id, 'gmv', gmv) ORDER BY gmv DESC))[1:3] AS top
  FROM (
        SELECT o.region, i.product_id, sum(i.qty * i.unit_price) AS gmv
          FROM shop.orders o
          JOIN shop.order_items i ON i.placed_at = o.placed_at AND i.order_id = o.id
         GROUP BY o.region, i.product_id
        ) r
 GROUP BY region;

-- 3) Top rated products with at least 100 reviews.
SELECT p.id, p.name, round(avg(r.rating)::numeric, 2) AS avg_rating, count(*) AS n
  FROM shop.products p
  JOIN shop.reviews r ON r.product_id = p.id
 GROUP BY p.id, p.name
HAVING count(*) >= 100
 ORDER BY avg_rating DESC
 LIMIT 10;

-- 4) Series: monthly GMV per region.
SELECT date_trunc('month', placed_at)::date AS month, region, sum(total) AS gmv
  FROM shop.orders
 GROUP BY 1, region
 ORDER BY 1, region;

-- 5) Average order value (AOV) per region with FILTER.
SELECT region,
       count(*) FILTER (WHERE status = 'paid')    AS paid_orders,
       avg(total) FILTER (WHERE status = 'paid')  AS aov_paid,
       avg(total)                                AS aov_all
  FROM shop.orders
 GROUP BY region;

-- 6) Window: per user, running total spend.
SELECT user_id, placed_at, total,
       sum(total) OVER (PARTITION BY user_id ORDER BY placed_at
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
  FROM shop.orders
 ORDER BY user_id, placed_at
 LIMIT 50;
