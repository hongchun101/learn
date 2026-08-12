# 第 04 章 SQL 进阶

> 数据人的吃饭工具。面试考 SQL 优化器、窗口函数、CTE;生产里慢 SQL 是事故第一来源。

---

## 一、为什么 SQL 还要"进阶"

会 `SELECT * FROM t WHERE id = 1` 是入门;能写出:

```sql
WITH cohort AS (
  SELECT user_id, DATE_TRUNC('month', signup_at) cohort_month
  FROM users
)
SELECT c.cohort_month,
       AGE_DAYS,
       COUNT(DISTINCT c.user_id) cohort_size,
       COUNT(DISTINCT e.user_id) active_users,
       COUNT(DISTINCT e.user_id)::FLOAT / COUNT(DISTINCT c.user_id) retention
FROM cohort c
LEFT JOIN events e ON c.user_id = e.user_id
  AND e.event_at BETWEEN c.cohort_month AND c.cohort_month + INTERVAL '30 days'
GROUP BY c.cohort_month, AGE_DAYS
ORDER BY c.cohort_month, AGE_DAYS;
```

这是专家水平。差的不在语法,而在**看懂执行计划、理解 CBO、写出可被优化器重写的 SQL**。

---

## 二、窗口函数(Window Function)

### 2.1 三要素

```
+------------+----------------+----------------+
|   函数     |   PARTITION BY |   ORDER BY     |
+------------+----------------+----------------+
|  ROW_NUMBER |  按什么分组    |  组内排序依据   |
|  RANK       |  同上          |  同上(并列同名)|
|  DENSE_RANK |  同上          |  同上(连续)   |
+------------+----------------+----------------+
```

### 2.2 实战模板

```sql
-- Top N per group:每个用户最近一笔订单
SELECT * FROM (
  SELECT user_id, order_id, amount, order_at,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_at DESC) rn
  FROM orders
) t
WHERE rn = 1;

-- 累计求和
SELECT dt, revenue,
       SUM(revenue) OVER (ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) cum_rev
FROM daily_revenue;

-- 滑动窗口(最近 7 天活跃用户数)
SELECT dt,
       COUNT(DISTINCT user_id) OVER (ORDER BY dt RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW) dau_7d
FROM events;
```

### 2.3 窗口 vs 聚合

| 维度 | GROUP BY | 窗口函数 |
|------|----------|---------|
| 行数 | 每组一行 | 每行都在 |
| 输出 | 聚合结果 | 行 + 聚合结果并列 |
| 性能 | 通常更优 | 需排序,大数据量慢 |

**原则**:能 GROUP BY 解决的别用窗口;需要"行级 + 聚合"才用窗口。

### 2.4 帧 (Frame) 子句

```
ROWS BETWEEN <start> AND <end>
RANGE BETWEEN <start> AND <end>

start/end 可选:
  UNBOUNDED PRECEDING | n PRECEDING | CURRENT ROW
  n FOLLOWING | UNBOUNDED FOLLOWING
```

**坑**:`RANGE` 按值范围(适合日期),`ROWS` 按物理行(适合固定窗口)。混用导致结果对不上。

---

## 三、CTE(Common Table Expressions)

### 3.1 基础用法

```sql
WITH
  active_users AS (
    SELECT user_id FROM events WHERE dt >= CURRENT_DATE - 30
  ),
  paying_users AS (
    SELECT DISTINCT user_id FROM orders WHERE status = 'paid'
  )
SELECT
  (SELECT COUNT(*) FROM active_users)  dau,
  (SELECT COUNT(*) FROM paying_users)  payers,
  (SELECT COUNT(*) FROM paying_users WHERE user_id IN (SELECT user_id FROM active_users)) retained_payers;
```

### 3.2 递归 CTE(树/图遍历)

```sql
WITH RECURSIVE org_tree AS (
  -- 锚点:根节点
  SELECT id, name, manager_id, 1 AS depth, ARRAY[id] AS path
  FROM employees WHERE manager_id IS NULL

  UNION ALL

  -- 递归:子节点
  SELECT e.id, e.name, e.manager_id, t.depth + 1, t.path || e.id
  FROM employees e
  JOIN org_tree t ON e.manager_id = t.id
  WHERE NOT (e.id = ANY(t.path))    -- 防环
)
SELECT * FROM org_tree ORDER BY path;
```

### 3.3 递归 CTE 性能陷阱

```
- 默认无索引:深度 > 1000 时极慢
- 大数据量(亿级)慎用:拆批 OR 改用图数据库
- "防环"是必须:否则死循环
- 优化器对递归支持有限,有时手动改写成迭代式 JOIN 更快
```

---

## 四、查询计划解读

### 4.1 执行计划读取顺序

```
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ...;

读取顺序(树形):
  深节点 -> 浅节点
  同层:从下往上(数据流向)
```

### 4.2 关键算子(PostgreSQL 为例)

| 算子 | 含义 | 关注 |
|------|------|------|
| Seq Scan | 全表扫 | 表小 OK,大表 + 高频 = 灾难 |
| Index Scan | 走索引 | 注意是否触发了回表 |
| Index Only Scan | 仅索引 | 最佳 |
| Hash Join | 哈希连接 | 大表 join 优选 |
| Nested Loop | 嵌套循环 | 小表驱动 |
| Merge Join | 排序归并 | 已排序输入 |
| Sort | 排序 | 内存不足会走磁盘,慢 100x |
| Hash Aggregate | 哈希聚合 | 流式,无排序开销 |
| Group Aggregate | 排序聚合 | 已排序输入才用 |

### 4.3 实测:慢 SQL 计划诊断

```sql
-- 案例:用户订单关联,大表 join 慢
EXPLAIN ANALYZE
SELECT u.name, SUM(o.amount)
FROM users u JOIN orders o ON u.id = o.user_id
WHERE o.dt BETWEEN '2024-01-01' AND '2024-01-31'
GROUP BY u.name;

-- 发现 Hash Join (cost=...)
-- 但实际过滤 99% 数据在 orders 上 -> 应先 filter
-- 优化:把 dt 过滤下推到 join 前
```

---

## 五、SQL 优化器原理

### 5.1 CBO(Cost-Based Optimizer)

```
   输入:        候选执行计划集合
                |
                v
   +-------------------------+
   | Cost Estimation         |
   | = rows × cost_per_row   |
   +-------------------------+
                |
                v
   +-------------------------+
   | 选择 cost 最低的计划    |
   +-------------------------+
                |
                v
   输出:执行计划
```

### 5.2 统计信息是命门

```sql
ANALYZE TABLE orders;          -- MySQL / PostgreSQL
ANALYZE TABLE orders COMPUTE STATISTICS;  -- Oracle
-- Hive: ANALYZE TABLE orders COMPUTE STATISTICS FOR COLUMNS;
```

| 数据库 | 统计信息 | 更新频率 |
|--------|----------|----------|
| PostgreSQL | `pg_statistic` | autovacuum 自动 |
| MySQL InnoDB | `cardinality` | `ANALYZE TABLE`,默认每天 |
| Hive | 各列 NDV/max/min | `ANALYZE TABLE` 后手动 |
| ClickHouse | 全量采样 | 实时估算,无需 |

**坑**:**统计信息过期**导致优化器选错计划,SQL 突然变慢。Hive 里尤为常见,批处理前务必对大表跑 `ANALYZE`。

### 5.3 常见优化器决策错误

| 现象 | 根因 | 修复 |
|------|------|------|
| 走 Seq Scan,实际有索引 | 统计信息过期/数据倾斜 | `ANALYZE` |
| Hash Join 退化成 Nested Loop | join 顺序选错 | 强制 join 顺序 `/*+ LEADING */` |
| 索引扫但过滤比 99% 还慢 | 回表过多 | 覆盖索引 / 改 Index Only Scan |
| Sort 走磁盘 | `work_mem` 太小 | 调大 `work_mem` |

### 5.4 优化器 Hint(慎用)

```sql
/*+ USE_INDEX(orders idx_user_dt) */     -- MySQL
/*+ INDEX(orders idx_user_dt) */         -- Oracle
/*+ LEADING(o u) */                     -- Oracle
```

**原则**:能用统计信息修就别 hint;hint 让 SQL 失去可移植性;只有稳定场景(报表、临时脚本)用。

---

## 六、大数据 SQL 引擎速览

| 引擎 | 优化器 | 特色 |
|------|--------|------|
| Hive | CBO(rule + cost) | 大数据离线,陈旧 |
| Spark SQL | Catalyst(基于规则 + cost) | 与 Hive 共用大部分语义 |
| Trino/Presto | 分布式 CBO | 跨源联邦查询 |
| ClickHouse | 弱 CBO,自研向量化 | 列存 + 极致压缩 |
| Doris | CBO + 向量化 | 实时数仓 |
| StarRocks | CBO + CBO + 向量化 | 高并发实时 |

---

## 七、生产案例

### 7.1 慢 SQL 止血

```sql
-- 1. 先看真实计划
EXPLAIN (ANALYZE, BUFFERS)
SELECT ...;

-- 2. 看锁等待
SELECT pid, wait_event_type, wait_event, query
FROM pg_stat_activity WHERE wait_event IS NOT NULL;

-- 3. 临时 kill
SELECT pg_cancel_backend(<pid>);     -- 优雅
SELECT pg_terminate_backend(<pid>);  -- 强制
```

### 7.2 数据倾斜

```sql
-- 场景:group by country, 某国占 90%
-- 解法 1:加随机前缀打散
SELECT country, COUNT(*) FROM (
  SELECT country, user_id,
         CASE WHEN RAND() < 0.1 THEN user_id || '-1' ELSE user_id END salt_user
  FROM events
) t GROUP BY country;

-- 解法 2:两阶段聚合(Spark SQL 适用)
SELECT country, SUM(cnt) FROM (
  SELECT country, user_id, COUNT(*) cnt, RAND() salt
  FROM events
  GROUP BY country, user_id, salt
) t GROUP BY country;
```

---

## 实战任务

1. **窗口函数 Top N**:每个部门工资最高的前 3 人,输出姓名、部门、工资、排名。
2. **递归 CTE 树**:构造一张 `comments(id, parent_id, content)` 表,写递归查询取出某条评论下所有后代评论(含层级)。
3. **执行计划诊断**:用 `EXPLAIN ANALYZE` 跑两条等价 SQL,一条 `IN`,一条 `EXISTS`,对比性能差异,理解优化器选择。
4. **统计信息实验**:往 `pg_class` 灌 100w 行,跑 `ANALYZE` 前后对比计划变化。
5. **数据倾斜复现 + 修复**:在 Spark SQL 制造 join 倾斜,用 salting 修复,对比 shuffle 数据量。
6. **CTE vs 子查询**:把 5 个嵌套子查询改写成 CTE,对比可读性和性能。

---

## 专家面试题

1. **`ROW_NUMBER`、`RANK`、`DENSE_RANK` 区别?**
   要点:`ROW_NUMBER` 唯一连续;`RANK` 并列跳号(1,1,3);`DENSE_RANK` 并列不跳号(1,1,2)。

2. **CTE 和子查询区别?什么时候 CTE 反而慢?**
   要点:CTE 可读性高、可复用、可递归;PostgreSQL 12+ 以前 CTE 默认物化,可能让优化器无法下推;**一次性的子查询直接写子查询**。

3. **`EXPLAIN` 和 `EXPLAIN ANALYZE` 区别?**
   要点:`EXPLAIN` 只展示计划(估算);`ANALYZE` 实际执行并返回真实耗时、rows、loops。生产线上小心 `ANALYZE` 本身会跑 SQL。

4. **Hash Join vs Nested Loop 怎么选?**
   要点:驱动表小 + 被驱动表索引 → NL;两张大表无序 → Hash Join;两边都已排序 → Merge Join。

5. **数据倾斜常见解法?**
   要点:加盐打散、两阶段聚合、map join(broadcast)、过滤热点 key、改 SQL 拆分逻辑。

6. **为什么大表 COUNT(*) 慢?怎么加速?**
   要点:PG 用 MVCC,COUNT 需要扫可见行;MySQL InnoDB 不存精确行数;Hive/ClickHouse 有近似函数。优化:PG 用索引扫、MySQL 用 `information_schema.tables.table_rows`(估算)、ClickHouse 用 `uniqExact` vs `uniq` (近似)。

7. **讲一次你优化过的最复杂的 SQL。**
   要点:必须讲清原始问题(慢/超时/资源)→ 用 EXPLAIN 定位到算子 → 改动(加索引/改写/调参)→ 量化收益(从 5min 到 30s)。

---

## 生产经验

- **慢 SQL 治理三件套**:`pg_stat_statements`(看 TOP 慢)、`pg_stat_activity`(看实时)、`EXPLAIN`(看计划)。DBA 必备。
- **大表加索引必须用 `CONCURRENTLY`**(PG)或 `ALGORITHM=INPLACE, LOCK=NONE`(MySQL),否则阻塞业务。
- **不要用 `SELECT *`**:列多时走不到覆盖索引;传输浪费;下游耦合严重。生产规范直接写进 Code Review。
- **CTE 链太长?拆中间表**:超过 5 层嵌套可读性崩塌,执行计划也难调。物化到 temp table 让优化器重估成本。
- **ClickHouse/Hive 不会自动用索引**:必须显式 `PARTITION BY`、`ORDER BY`,否则查亿级表直接 30 秒+。