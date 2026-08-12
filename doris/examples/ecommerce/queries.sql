-- Apache Doris 4.x 电商教程：查询与可人工核对的期望值
USE doris_lab;

-- Q1 主键模型覆盖验证：应只有 4 行；订单 1001 状态应为 REFUNDED。
SELECT COUNT(*) AS order_rows FROM fact_orders;
SELECT order_id, order_status, update_time
FROM fact_orders
WHERE order_id = 1001 AND order_date = '2026-08-01';

-- Q2 明细 GMV：取消状态尚未关联，按商品明细算。
-- 订单 1001：(199-20)+(19-10)=179+9=188；订单 1002：(89-9)=80；
-- 2026-08-01/shop 10 = 188 + 80 = 268.00
-- 2026-08-02/shop 20 = (299-0) + (2*240-30) = 299 + 450 = 749.00
SELECT order_date, shop_id,
       SUM(quantity * unit_price - discount_amount) AS item_gmv
FROM fact_order_items
GROUP BY order_date, shop_id
ORDER BY order_date, shop_id;

-- Q3 只统计 PAID 订单。预期 shop 10 = 80.00，shop 20 = 450.00。
SELECT shop_id, SUM(pay_amount) AS paid_gmv
FROM fact_orders
WHERE order_status = 'PAID'
GROUP BY shop_id
ORDER BY shop_id;

-- Q4 Aggregate Key 中精确订单数与近似买家数；省略 category_id，
-- 依靠 SUM/BITMAP_UNION/HLL_UNION 将分类粒度滚动汇总到日期 × 店铺。
-- buyer_hll 是近似 UV（通常约 1% 误差，可能到 2%），不能用于财务结算。
SELECT order_date, shop_id,
       SUM(gmv) AS gmv,
       SUM(item_count) AS items,
       BITMAP_UNION_COUNT(order_bitmap) AS exact_orders,
       HLL_UNION_AGG(buyer_hll) AS approx_buyers
FROM agg_shop_daily
GROUP BY order_date, shop_id
ORDER BY order_date, shop_id;

-- Q5 窗口函数：按支付额给已支付订单排名。
SELECT order_id, shop_id, pay_amount,
       DENSE_RANK() OVER (PARTITION BY shop_id ORDER BY pay_amount DESC) AS amount_rank
FROM fact_orders
WHERE order_status = 'PAID'
ORDER BY shop_id, amount_rank;

-- Q6 防止一对多 Join 重复计数：先按订单汇总商品，再连接订单。
WITH item_by_order AS (
    SELECT order_date, order_id,
           SUM(quantity * unit_price - discount_amount) AS item_amount
    FROM fact_order_items
    GROUP BY order_date, order_id
)
SELECT o.order_id, o.order_status, o.pay_amount, i.item_amount
FROM fact_orders o
JOIN item_by_order i
  ON o.order_id = i.order_id AND o.order_date = i.order_date
ORDER BY o.order_id;

-- Q7 观察分区裁剪和谓词下推。
EXPLAIN VERBOSE
SELECT shop_id, SUM(pay_amount)
FROM fact_orders
WHERE order_date = '2026-08-01' AND order_status = 'PAID'
GROUP BY shop_id;
