# Module 02 · 关系型数据库与 SQL 进阶

> 这一章是数仓 SQL 的"基础工具箱"：从简单查询到窗口函数、递归
> CTE、查询计划、Pivot/Unpivot。**所有 SQL 在 DuckDB 上可直接运行**；
> Trino / Hive / Spark / Flink SQL 的差异在 02-ch07 列出。

读完这一章你能：

- 写出**任意复杂度的窗口函数**（row_number / rank / dense_rank /
  lag / lead / first_value / sum over / ntile）
- 用 **递归 CTE** 做层级查询（图遍历、爆炸式展开、组织树）
- 读懂 **EXPLAIN**，识别全表扫描、shuffle、broadcast join
- 用 **PIVOT / UNPIVOT** 把行变列、把列变行
- 用 **LATERAL / APPLY** 做 per-row 子查询
- 区分 **CTE 物化 vs 内联**，知道什么时候 CTE 会导致 query 变慢
- 在 DuckDB / Trino / Hive / Spark / Flink SQL 之间做语法转换

## 章节

- [ch01 · 聚合与分组进阶](#ch01--聚合与分组进阶)
- [ch02 · 窗口函数](#ch02--窗口函数)
- [ch03 · 递归 CTE 与层级查询](#ch03--递归cte与层级查询)
- [ch04 · PIVOT / UNPIVOT](#ch04--pivot--unpivot)
- [ch05 · LATERAL 与 per-row subquery](#ch05--lateral与per-row-subquery)
- [ch06 · 读懂执行计划 (EXPLAIN)](#ch06--读懂执行计划explain)
- [ch07 · 跨引擎 SQL 差异速查](#ch07--跨引擎sql差异速查)
- [ch08 · 50 道 SQL 练习题](#ch08--50道sql练习题)

## 快速开始

```bash
python shared/generate_data.py --scale small
pytest modules/02-sql-advanced/tests/ -v
```

---

## ch01 · 聚合与分组进阶

### GROUPING SETS / ROLLUP / CUBE

```sql
-- 3 种"多维聚合"的语法糖
SELECT
  region, country, city,
  SUM(sales) AS sales
FROM fact_sales
GROUP BY GROUPING SETS (
  (region),
  (region, country),
  (region, country, city),
  ()                          -- 全局 total
)
ORDER BY region NULLS LAST, country NULLS LAST, city NULLS LAST;
```

`ROLLUP(a, b, c)` 等价于 `GROUPING SETS((a,b,c), (a,b), (a), ())`，
层级"由细到粗"。`CUBE(a, b, c)` 是所有组合的笛卡尔积，常用于
多维交叉报表。

### HAVING vs WHERE

```sql
SELECT user_id, COUNT(*) AS n
FROM ods.orders
WHERE total > 0              -- 行级过滤 (group by 之前)
GROUP BY user_id
HAVING COUNT(*) > 5          -- 组级过滤 (group by 之后)
ORDER BY n DESC;
```

### 近似聚合

```sql
SELECT
  approx_count_distinct(user_id) AS approx_users,
  approx_quantile(total, 0.95)   AS p95_total
FROM ods.orders;
```

DuckDB / Spark / Trino 都支持 `approx_count_distinct`（HLL 算法），
**比 `COUNT(DISTINCT)` 快 10-100×，误差 < 1%**。

---

## ch02 · 窗口函数

窗口函数对"与当前行相关的一组行"做计算，**不会折叠行**。

### 三种函数族

| 族 | 例子 | 用途 |
|---|---|---|
| **排名** | `row_number() / rank() / dense_rank() / ntile(4)` | top-N、分桶、连续编号 |
| **偏移** | `lag() / lead() / first_value() / last_value() / nth_value()` | 上一行/下一行、累计、找首次出现 |
| **聚合** | `sum() over / avg() over / count() over / max() over` | 累计、移动平均、组内占比 |

### 关键语法：`OVER (...)`

```sql
function_name([expr]) OVER (
  [ PARTITION BY col1, col2 ... ]    -- 窗口边界
  [ ORDER BY col3 [ASC|DESC] ... ]   -- 帧内顺序
  [ ROWS / RANGE frame_clause ]      -- 帧大小
)
```

### 8 个真实业务例子

```sql
-- 1. 每个用户的第一笔订单
SELECT * FROM (
  SELECT
    user_id, order_id, total,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_ts) AS rn
  FROM dwd.orders
) WHERE rn = 1;

-- 2. 每个用户最近 7 天的累计金额
SELECT
  user_id, dt,
  SUM(order_amount) OVER (
    PARTITION BY user_id
    ORDER BY dt
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS amount_7d
FROM dws.user_order_1d
ORDER BY user_id, dt;

-- 3. 同比 / 环比
SELECT
  dt, gmv,
  LAG(gmv, 7)  OVER (ORDER BY dt) AS gmv_last_week,
  LAG(gmv, 30) OVER (ORDER BY dt) AS gmv_last_month,
  ROUND(100.0 * (gmv - LAG(gmv, 7) OVER (ORDER BY dt)) /
              LAG(gmv, 7) OVER (ORDER BY dt), 2) AS gmv_yoy_pct
FROM ads.gmv_daily
ORDER BY dt;

-- 4. 部门内薪资排名
SELECT
  dept, name, salary,
  RANK()         OVER (PARTITION BY dept ORDER BY salary DESC) AS rk,
  DENSE_RANK()   OVER (PARTITION BY dept ORDER BY salary DESC) AS drk,
  PERCENT_RANK() OVER (PARTITION BY dept ORDER BY salary)       AS pct
FROM employees;

-- 5. 找连续登录用户（gap-and-island）
SELECT
  user_id, dt,
  dt - INTERVAL (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY dt)) DAY AS grp
FROM dwd.user_events
WHERE event_type = 'login';

-- 6. 留存：D+1, D+7, D+30
WITH first_event AS (
  SELECT user_id, MIN(dt) AS d0 FROM dwd.user_events GROUP BY user_id
)
SELECT
  e.dt - f.d0 AS days_since,
  COUNT(DISTINCT e.user_id) AS retained
FROM dwd.user_events e
JOIN first_event f USING (user_id)
WHERE e.dt - f.d0 IN (1, 7, 30)
GROUP BY 1
ORDER BY 1;

-- 7. 帕累托 (top 20% 用户贡献 80% 收入)
SELECT
  user_id, lifetime_amount,
  SUM(lifetime_amount) OVER (ORDER BY lifetime_amount DESC) /
  SUM(lifetime_amount) OVER () AS cum_pct
FROM dwt.user_topic
ORDER BY lifetime_amount DESC;

-- 8. 移动平均 (平滑日活)
SELECT
  dt, dau,
  AVG(dau) OVER (ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS dau_ma7
FROM ads.dau_daily;
```

### ROWS vs RANGE 帧

```sql
-- ROWS: 物理行
SUM(x) OVER (ORDER BY ts ROWS BETWEEN 1 PRECEDING AND CURRENT ROW)

-- RANGE: 逻辑范围（同 ts 值的行都算）
SUM(x) OVER (ORDER BY ts RANGE BETWEEN INTERVAL 1 DAY PRECEDING AND CURRENT ROW)
```

---

## ch03 · 递归 CTE 与层级查询

递归 CTE 用 `WITH RECURSIVE t AS (anchor UNION ALL recursive)` 写。
DuckDB / Trino / Spark 3 / Postgres / Oracle 都支持；Hive 仅 Spark 执行引擎支持。

### 例 1：组织树（员工 → 经理 → 经理的经理）

```sql
WITH RECURSIVE org AS (
  -- anchor: top-level (no manager)
  SELECT id, name, manager_id, 0 AS depth, name AS path
  FROM employees
  WHERE manager_id IS NULL

  UNION ALL

  -- recursive: their reports
  SELECT e.id, e.name, e.manager_id, o.depth + 1, o.path || ' > ' || e.name
  FROM employees e
  JOIN org o ON e.manager_id = o.id
)
SELECT * FROM org ORDER BY depth, name;
```

### 例 2：BOM 爆炸（产品 → 部件 → 子部件 → ...）

```sql
WITH RECURSIVE bom AS (
  SELECT part_id, parent_part_id, qty, 1 AS level
  FROM bill_of_materials
  WHERE parent_part_id = 'X'

  UNION ALL

  SELECT b.part_id, b.parent_part_id, b.qty, bom.level + 1
  FROM bill_of_materials b
  JOIN bom ON b.parent_part_id = bom.part_id
)
SELECT level, part_id, SUM(qty) AS qty_total
FROM bom GROUP BY 1, 2 ORDER BY 1;
```

### 例 3：图遍历（社交网络 6 度分隔）

```sql
WITH RECURSIVE friends AS (
  SELECT user_id, friend_id, 1 AS depth
  FROM edges WHERE user_id = 42
  UNION ALL
  SELECT f.user_id, e.friend_id, f.depth + 1
  FROM friends f
  JOIN edges e ON f.friend_id = e.user_id
  WHERE f.depth < 6
)
SELECT depth, COUNT(DISTINCT friend_id) AS reach
FROM friends GROUP BY 1 ORDER BY 1;
```

### 例 4：日期序列（填补缺失日期）

```sql
WITH RECURSIVE dates AS (
  SELECT DATE '2024-01-01' AS dt
  UNION ALL
  SELECT dt + INTERVAL 1 DAY FROM dates WHERE dt < DATE '2024-12-31'
)
SELECT d.dt, COALESCE(g.gmv, 0) AS gmv
FROM dates d
LEFT JOIN ads.gmv_daily g ON d.dt = g.dt;
```

### 性能与陷阱

- 递归 CTE 在 Spark 3.5+ 才默认启用；老版本要 `SET spark.sql.adaptive.enabled=true`
- 一定要给递归分支一个**终止条件**（depth < N 或 WHERE 限定）
- 大图遍历用 BFS 比 DFS 内存稳

---

## ch04 · PIVOT / UNPIVOT

### PIVOT：行 → 列

```sql
-- "每个 status 一列"
SELECT * FROM (
  SELECT user_id, status, total FROM dwd.orders
)
PIVOT (
  SUM(total) FOR status IN ('completed', 'paid', 'cancelled', 'refunded')
) AS p (user_id, completed, paid, cancelled, refunded);
```

### UNPIVOT：列 → 行

```sql
-- 把上面 PIVOT 的结果还原回长表
SELECT user_id, status, total
FROM (
  SELECT user_id, completed, paid, cancelled, refunded
  FROM pivoted
)
UNPIVOT (
  total FOR status IN (completed, paid, cancelled, refunded)
);
```

### 跨引擎差异

| 引擎 | PIVOT | UNPIVOT |
|---|---|---|
| DuckDB | ✓ (`PIVOT ...`) | ✓ (`UNPIVOT ...`) |
| Spark SQL 3.4+ | ✓ | ✓ |
| Trino | ✗（用 `CASE WHEN + GROUP BY` 模拟） | ✓ |
| Hive | ✗ | ✗ |
| Flink SQL | ✓ | ✓ |

**Trino 没有原生 PIVOT**，用条件聚合：

```sql
SELECT
  user_id,
  SUM(CASE WHEN status='completed' THEN total END) AS completed,
  SUM(CASE WHEN status='paid'      THEN total END) AS paid,
  SUM(CASE WHEN status='cancelled' THEN total END) AS cancelled,
  SUM(CASE WHEN status='refunded'  THEN total END) AS refunded
FROM dwd.orders
GROUP BY user_id;
```

---

## ch05 · LATERAL 与 per-row subquery

LATERAL 让子查询可以引用"前面 FROM 中的列"——等价于"对每行执行一次子查询"。

```sql
-- 每个用户最近 3 笔订单
SELECT u.user_id, recent.*
FROM ods.users u
LEFT JOIN LATERAL (
  SELECT order_id, total, order_ts
  FROM dwd.orders o
  WHERE o.user_id = u.user_id
  ORDER BY order_ts DESC
  LIMIT 3
) recent ON TRUE;
```

等价写法（无 LATERAL，Trino 也支持）：

```sql
SELECT u.user_id, recent.*
FROM ods.users u
LEFT JOIN (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_ts DESC) rn
  FROM dwd.orders
) recent ON recent.user_id = u.user_id AND recent.rn <= 3;
```

LATERAL 在 Spark 3.3+ 默认可用。

---

## ch06 · 读懂执行计划 (EXPLAIN)

### DuckDB EXPLAIN

```sql
EXPLAIN SELECT user_id, COUNT(*) FROM dwd.orders GROUP BY user_id;
EXPLAIN ANALYZE  -- 实际运行并返回耗时
SELECT ... ;
```

输出是树形：

```
HASH_GROUP_BY (cost=...)
  └── HASH_JOIN
        ├── SEQ_SCAN (orders)
        └── SEQ_SCAN (users)
```

### 看什么

- **SEQ_SCAN** → 全表扫描；如果表很大，就是瓶颈
- **HASH_JOIN** → 哈希连接；小表会 broadcast
- **NESTED_LOOP_JOIN** → 嵌套循环；通常 O(M·N)
- **COLUMN_DATA_SCAN** → 列存读，**比 SEQ_SCAN 快很多**
- **PROJECTION** → 投影（选择列）
- **FILTER** → 过滤（WHERE）
- **AGGREGATE** → 聚合
- **WINDOW** → 窗口函数

### 真实调优案例

```sql
-- 问题：query 慢，10s
EXPLAIN ANALYZE
SELECT * FROM dwd.orders WHERE order_id = 12345;

-- 计划显示：
--   SEQ_SCAN dwd.orders  (rows=10000000)
--   FILTER (order_id = 12345)

-- 优化：建索引（如果该列常被点查）
CREATE INDEX idx_dwd_orders_id ON dwd.orders(order_id);

-- 重新跑：rows=1, FILTER 变 INDEX_SCAN
```

### Spark EXPLAIN

```sql
EXPLAIN
SELECT user_id, COUNT(*) FROM dwd.orders GROUP BY user_id;
```

返回 `== Physical Plan ==`，关注 `Exchange (hashpartitioning)`——这是 shuffle，**shuffle 是 Spark 最贵的操作**。

### Trino EXPLAIN

```sql
EXPLAIN (FORMAT JSON)
SELECT ...;
```

返回 JSON，看 `distributedStages` 数量、shuffle 字节数。

---

## ch07 · 跨引擎 SQL 差异速查

| 语法 | DuckDB | Spark SQL | Trino | Hive | Flink SQL |
|---|---|---|---|---|---|
| `WITH RECURSIVE` | ✓ | ✓ (3.x) | ✓ | ✓ (Spark eng) | ✓ |
| 窗口函数 | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PIVOT/UNPIVOT` | ✓ | ✓ | ✗ (CASE 模拟) | ✗ | ✓ |
| `LATERAL` | ✓ | ✓ (3.3+) | ✓ | ✗ | ✓ |
| `APPROX_COUNT_DISTINCT` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `LISTAGG` | ✓ | ✓ | ✓ | ✗ (concat 模拟) | ✗ |
| `FILTER (WHERE ...)` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `GROUPING SETS` | ✓ | ✓ | ✓ | ✓ (2.3+) | ✓ |
| 类型 `BIGINT` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 字符串 `'a' \|\| 'b'` | ✓ | ✓ | ✓ | ✗ (`concat()`) | ✗ |
| 字典 `\text{^}` | (转义) | 转义 | 转义 | 转义 | 转义 |

**Hive 兼容性最好的是 Spark SQL**——`SET hive.tblproperties` 风格都能用。

---

## ch08 · 50 道 SQL 练习题

> 按"仓库日常"分桶。每题都基于 `ods.orders` / `ods.users` / `ods.products`。

**桶 A：基础（1-10）**

1. 列出每个用户的总订单金额
2. 列出每个用户最近的订单
3. 每个 category 的 GMV
4. 每个 category 的活跃用户数
5. 每月新用户数
6. 复购率（下过 ≥ 2 单的用户 / 总用户）
7. 客单价（AOV）
8. 订单状态分布
9. 每个用户的首单和末单日期
10. 每个 category 的 AOV

**桶 B：窗口（11-20）**

11. 每个用户最近 3 笔订单
12. 每个用户第 2 单的金额
13. 累计 GMV（按天）
14. 7 日移动平均 DAU
15. 每个用户上一单的金额
16. 同部门薪资排名前 3
17. 连续登录 ≥ 3 天的用户
18. 相邻两单的间隔
19. 帕累托：前 20% 用户贡献多少
20. 同比 / 环比

**桶 C：层级（21-30）**

21. 员工的直接下属
22. 员工的全部下属（递归）
23. 部门树深度
24. 从 CEO 到员工的路径
25. BOM 爆炸：产品 X 的所有零件
26. 日期序列填补
27. 数字序列 1..N
28. 社交网络 2 度好友
29. 找出循环引用（部门经理不应该是自己）
30. 树形菜单 JSON 输出

**桶 D：聚合艺术（31-40）**

31. 每个用户的 RFM
32. RFM 5x5 分桶
33. 商品相似度（共同购买）
34. 用户相似度（共同商品）
35. 漏斗：pv → cart → pay 各步转化率
36. 留存矩阵（D+1, D+7, D+30）
37. 渠道归因（首次 / 末次 / 线性）
38. Session 切分（30 min 无活动算新 session）
39. 路径分析（最常出现的 3 步路径）
40. A/B test 显著性检验

**桶 E：性能与陷阱（41-50）**

41. NULL 陷阱：`NULL = NULL` 是 NULL，不是 TRUE
42. `COUNT(*)` vs `COUNT(col)`：后者忽略 NULL
43. `DISTINCT` 在 JOIN 后的爆炸
44. UNION vs UNION ALL
45. IN vs EXISTS 性能
46. `GROUP BY` 隐式排序：Spark 3+ 不再保证
47. `WHERE` 早过滤 vs `HAVING` 晚过滤
48. 子查询 vs JOIN 性能
49. CTE 物化：`WITH ... AS MATERIALIZED`
50. `LIMIT` 不一定减少计算量

> 答案见 [`src/exercises.sql`](src/exercises.sql)。

---

## 文件

```
02-sql-advanced/
├── README.md               ← 本文件
├── src/
│   ├── ch01_advanced_grouping.sql
│   ├── ch02_window_functions.sql
│   ├── ch03_recursive_cte.sql
│   ├── ch04_pivot_unpivot.sql
│   ├── ch05_lateral.sql
│   ├── ch06_explain.sql
│   ├── exercises.sql
│   └── cross_engine_cheatsheet.md
└── tests/
    ├── test_window.py
    ├── test_recursive.py
    ├── test_pivot.py
    └── test_lateral.py
```
