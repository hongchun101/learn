# 04｜分析 SQL、指标语义与查询正确性

会写 SQL 不等于会做可信分析。专家先证明粒度和口径，再优化速度。

## 1. 每条指标 SQL 的五个问题

1. 事实表一行是什么粒度？
2. Join 是 1:1、N:1、1:N 还是 N:N？
3. 过滤发生在 Join 前还是后，是否改变外连接语义？
4. 时间、状态、退款、迟到数据口径是什么？
5. 空值、重复和近似算法是否可接受？

运行 `examples/ecommerce/queries.sql`，人工核对每个预期值。

## 2. Join 防重复

订单和商品是 1:N。直接 Join 后 `SUM(order.pay_amount)` 会按商品数重复。安全模式是先把多侧聚合到订单粒度：

```sql
WITH item_by_order AS (
  SELECT order_date, order_id,
         SUM(quantity * unit_price - discount_amount) AS item_amount
  FROM doris_lab.fact_order_items
  GROUP BY order_date, order_id
)
SELECT o.shop_id, SUM(o.pay_amount), SUM(i.item_amount)
FROM doris_lab.fact_orders o
JOIN item_by_order i
  ON o.order_date=i.order_date AND o.order_id=i.order_id
WHERE o.order_status='PAID'
GROUP BY o.shop_id;
```

验证 Join 基数：分别记录连接前后行数、Key 去重数，并抽样重复最大的 Key。

## 3. 外连接谓词位置

```sql
-- 会把没有订单的用户过滤掉，语义退化为内连接
SELECT u.user_id, o.order_id
FROM dim_user u LEFT JOIN fact_orders o ON u.user_id=o.user_id
WHERE o.order_status='PAID';

-- 保留没有已支付订单的用户
SELECT u.user_id, o.order_id
FROM dim_user u LEFT JOIN fact_orders o
  ON u.user_id=o.user_id AND o.order_status='PAID';
```

优化器可能做等价改写，但 SQL 作者必须先保证逻辑等价。

## 4. 时间语义

明确四个对象：源时区、Doris 会话时区、存储值、业务自然日。跨 DST 地区尤其不能把 UTC 时间直接 `DATE()` 当本地日期。

推荐：事件时间存明确统一标准（常用 UTC），业务日期作为经过数据契约定义的派生列；会话初始化显式设置时区；日报用半开区间 `[start, end)`，不要用 `23:59:59`。

```sql
WHERE event_time >= '2026-08-01 00:00:00'
  AND event_time <  '2026-08-02 00:00:00'
```

## 5. 窗口函数

窗口函数用于排名、累计、移动窗口、会话边界。注意完整排序键确保确定性：

```sql
SELECT order_id, user_id, create_time, pay_amount,
       ROW_NUMBER() OVER (
         PARTITION BY user_id
         ORDER BY create_time, order_id
       ) AS seq,
       SUM(pay_amount) OVER (
         PARTITION BY user_id
         ORDER BY create_time, order_id
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS cumulative_amount
FROM doris_lab.fact_orders;
```

没有 `order_id` 作为 tie-breaker，同一时间的顺序可能不稳定。`ROWS` 与 `RANGE` 的边界语义不同，必须显式选择。

## 6. 去重与漏斗

“用户数”不是一种算法：

- 精确临时查询：`COUNT(DISTINCT)`，先测资源；
- 高频精确：Bitmap 预聚合，ID 需安全映射；
- 大规模近似：HLL，报告误差边界；
- 当前状态去重：Unique Key；
- 事件重复：按事件唯一 ID 和版本规则去重。

漏斗要定义事件顺序、窗口、重复事件、跨天和迟到处理。先用小样本枚举期望路径，再扩展到全量。

## 7. CTE、子查询与集合

CTE 首要作用是表达清晰的中间粒度，不保证一定物化或只执行一次。用 `EXPLAIN` 验证实际计划。`UNION` 会去重，`UNION ALL` 不去重；能证明来源互斥时优先 `UNION ALL`。

避免：

- 在分区列上做阻碍裁剪的复杂函数；
- `SELECT *` 扫描宽表；
- 无界 `ORDER BY`；
- 大表相关子查询却不看改写结果；
- 为“性能”使用可能改变语义的 Join Hint。

## 8. 指标契约

每个生产指标应版本化记录：

```text
名称：paid_gmv
粒度：业务日 × 店铺
公式：SUM(pay_amount)
范围：order_status='PAID'（退款如何处理另列）
时间：支付业务日期，Asia/Shanghai
迟到：T+2 日内回补
精度：DECIMAL，精确
数据源与负责人：...
验证：与支付系统日账差异 <= 0.01%，超限阻断发布
```

没有契约的同名指标最终会产生多个“正确答案”。

## 9. SQL 正确性验证

- 手工可算的固定夹具；
- 守恒关系，如分组和等于总和；
- 边界：NULL、零行、重复 Key、同时间、月末、时区；
- 与权威源按多个维度对账；
- 改写前后双跑，比较行集而非只比较行数；
- 近似算法报告误差，不用一次相等宣称正确。

## 10. 实验

1. 故意写出订单与商品重复计数 SQL，定位并修复；
2. 为 LEFT JOIN 构造无订单用户，证明谓词位置影响；
3. 用同一时间两笔订单验证窗口排序确定性；
4. 为 GMV、支付买家数、7 日复购率各写指标契约；
5. 将一个复杂查询拆成有清晰粒度的 CTE，并证明结果不变。

## 11. 过关标准

任何指标都能回答粒度、基数、时间、迟到、精度，并有可执行的反例测试；改写前后结果集一致，近似算法明确误差边界。

参考：[查询数据目录](https://doris.apache.org/docs/4.x/query-data/)、[SQL 手册](https://doris.apache.org/docs/4.x/sql-manual/)。

下一章：[执行原理与系统化调优](05-performance.md)。
