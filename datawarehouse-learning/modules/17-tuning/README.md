# 模块 17：性能调优（Performance Tuning）

> 当数据量从百万跃升到十亿、从单表扩展到上百张宽表时，性能调优就不再是“加
> 索引”的小技巧，而是一套贯穿**建模、SQL、引擎配置、集群资源**的系统工
> 程。本章以 DuckDB 为参考引擎，结合 Trino / ClickHouse / Doris / Spark
> 的常见做法，把调优拆成八条主线：`EXPLAIN` 读计划 → 分区裁剪 → 桶裁剪
> → Join 策略 → 数据倾斜 → 资源调优 → 成本优化 → 闭环验证。

---

## ch01 性能调优思路

调优的第一性原则：**先测量，再行动**。常见误区是凭直觉猜“哪里慢”，
结果把精力花在已经够快的环节。标准流程是：

1. **确定基线**：用 `EXPLAIN ANALYZE` 记录关键查询的 wall time、扫描行数
   / 字节数、内存峰值。
2. **定位瓶颈**：行扫描多 ⇒ 缺分区/桶裁剪；shuffle 多 ⇒ Join 策略错；
   倾斜 ⇒ key 分布问题；CPU 跑满但 IO 没满 ⇒ 资源配额不足。
3. **施加最小改动**：每次只改一个变量（例如只加排序键、只改 Join 提示），
   跑同一组查询做 A/B 对比。
4. **写入回归用例**：把验证 SQL 固化为 `tests/test_tuning.py`，防止
   “昨天优化的 SQL 今天被同事改回去”。

一条经验公式：

```
实际代价 ≈ 扫描字节数 / 磁盘吞吐
        + Shuffle 字节数 / 网络吞吐
        + Join 过程中溢盘次数 × 磁盘 IO
```

只要把任意一项降到 1/10，端到端延迟几乎一定降到 1/2 以下。

---

## ch02 执行计划（EXPLAIN / EXPLAIN ANALYZE）

`EXPLAIN` 给你**计划树**，`EXPLAIN ANALYZE` 在此基础上**实际执行并回填
统计**。DuckDB 的计划节点里最值得关注的字段：

| 字段 | 含义 | 调优含义 |
|------|------|----------|
| `Rows Scanned` | 该节点实际扫过的行数 | 与输出行数差距越大说明过滤差 |
| `Rows Produced` | 该节点输出行数 | 用于判断上溢 |
| `Memory Used` | 峰值内存 | 决定是否需要调 `memory_limit` |
| `Operator Type` | `HASH_JOIN` / `NESTED_LOOP` / `PIECEWISE_MERGE_JOIN` | 决定下一步动作 |
| `Expressions` | 谓词下推位置 | 若过滤在最上层 ⇒ 缺分区/排序键 |

读计划的口诀：**自底向上**，先看最末端的 Scan 节点扫了多少，再向上看
是否有不必要的 `Cross Product` / `Materialize` / `Sort`。

`src/tuning_demo.sql` 中的每条查询都加了 `EXPLAIN ANALYZE`。在生产环境
中，可以把计划落盘到 `EXPLAIN ANALYZE FORMAT JSON ...`，用 diff 工具对比
改动前后的差异。

---

## ch03 分区裁剪（Partition Pruning）

**目标**：让 Scan 节点只读与谓词相关的文件 / Row Group。Hive / Iceberg /
Delta Lake 用目录分区，DuckDB / Parquet 用 Row Group 统计信息。

### 常见分区列选择

- **时间列**：`order_date` / `dt` —— 90% 的查询带时间范围。
- **大区字段**：`region`、`biz_line` —— 减少跨区扫描。
- **不要**用高基数列（如 `user_id`）做分区，会导致目录爆炸。

### 实现方式

```sql
-- Hive / Spark 风格
CREATE TABLE dwd.orders PARTITIONED BY (dt) ...;

-- Iceberg 隐式分区
CREATE TABLE dwd.orders PARTITIONED BY (days(order_ts));

-- DuckDB：通过 ORDER BY 让 Row Group 自带 min/max 统计
CREATE TABLE dwt.orders_by_date AS
SELECT * FROM ods.orders ORDER BY order_date, order_id;
```

### 验证

执行 `WHERE order_date BETWEEN ...` 后，在 `EXPLAIN ANALYZE` 中观察
`Rows Scanned`：分区裁剪生效时该数字接近输出行数 × 选择率；否则接近全表
行数。`test_layouts_preserve_row_count` 与 `test_filtered_aggregates_are_layout_invariant`
共同验证了排序前后**逻辑结果一致**，是裁剪不会出错的硬保证。

---

## ch04 桶裁剪（Bucket Pruning）

桶（Bucket）是分区之内的二次切分，把同一分区内的大量数据按 hash 打散到
固定数量的桶文件中：

```
bucket_id = hash(bucket_col) % num_buckets
```

### 典型收益

- **Join**：两表按同一列分桶 ⇒ 只需做桶内局部 Join，省掉 Shuffle
  （Spark / Trino 中的 `Bucketed Join`）。
- **聚合**：按 `GROUP BY` 列分桶 ⇒ 预聚合即可下推。
- **采样**：直接读单个桶文件 = 1/N 的全表采样。

### 选择桶列的准则

| 准则 | 说明 |
|------|------|
| 高频 Join / Group By | 桶要打在热点列 |
| 基数适中（百到百万） | 太大 ⇒ 单桶过载；太小 ⇒ 桶文件过多 |
| 不可变 | 重写代价极高 |
| 与分区正交 | 避免桶恰好覆盖分区的极端情况 |

`src/tuning_demo.sql` 中 `dwt.orders_by_user` 就是“按 user_id 排序”的
桶化近似 —— DuckDB 在 Scan 时同样能利用 Row Group 统计裁剪。在 Hive /
Spark 里直接 `CLUSTERED BY (user_id) INTO 32 BUCKETS`。

---

## ch05 Join 策略

主流引擎支持的 Join 算子：

| 算子 | 适用场景 | 代价 |
|------|----------|------|
| **Broadcast / Nested Loop** | 一侧很小（< memory_limit 的 1/10） | O(N) 建表广播 |
| **Hash Join** | 中等双方，无序输入 | O(N + M) 内存 |
| **Sort-Merge Join** | 双方都已排序 / 有序存储 | O(N log N + M log M) |
| **Shuffle Hash Join** | 大表 Join 大表，必须按 Join key 重分布 | O(N + M) + 网络 |
| **Partition Pruned Join** | 同桶 / 同分区列 | 仅做桶内 Join |

### 引擎默认选择

- **Trino / Spark**：用 CBO + 统计信息自动选；可通过 `set spark.sql.adaptive.enabled=true`
  触发 AQE 动态调整。
- **ClickHouse**：默认 Hash Join，对小表自动 Broadcast。
- **Doris / StarRocks**：默认 Hash Join，可加 hint `/*+ BROADCAST(t) */`
  强制广播。
- **DuckDB**：自动；过小一侧自动 NESTED LOOP，过大则 HASH JOIN。

### Hint 写法一览

```sql
-- Trino / Spark
SELECT /*+ BROADCAST(dim) */ ...
-- Doris / StarRocks
SELECT /*+ SHUFFLE_MERGE(t1,t2) */ ...
-- ClickHouse
SELECT * FROM t1 INNER JOIN t2 USING(k) SETTINGS join_algorithm='partial_merge';
```

`src/tuning_demo.sql` 第 8 节对比了 `dim_user_small`（10 行）触发 Nested
Loop 与 `dim_user_big`（1000 行）触发 Hash Join 的不同计划。

---

## ch06 数据倾斜

**症状**：单个 Reduce / Worker 耗时是其他节点的 10 倍以上，任务整体进度
卡在 99%。根因是某个 Key 占比极高（如热门商品、热门直播间、大客户）。

### 检测

```sql
-- DuckDB / Spark / Trino 通用
SELECT user_id, COUNT(*) c
FROM dwt.orders
GROUP BY user_id ORDER BY c DESC LIMIT 10;
```

`src/tuning_demo.sql` 第 9 节构造了一张 90% 行都属于 `user_id=1` 的
`dwt.orders_skewed`，并通过 EXPLAIN ANALYZE 展示 GROUP BY 在倾斜分布下
的代价。

### 处理方法

1. **打散 Key**：在 SQL 中加随机前缀，如
   `concat('p', uuid(), user_id)`；聚合完再剥掉前缀。
2. **两阶段聚合**：本地 `GROUP BY key, salt`，全局再聚合。
3. **Broadcast Hot Key**：把热点维表全量广播，避免热点 Key 走 Shuffle。
4. **资源隔离**：单独把热点 Key 的 Reduce 资源池拉满。

`test_filtered_aggregates_are_layout_invariant` 验证了倾斜前后 `COUNT`
一致，避免热 Key 误改结果集。

---

## ch07 资源调优

调优的最后一道闸门是**集群 / 进程级参数**：

| 参数 | 推荐起点 | 说明 |
|------|----------|------|
| `memory_limit` | 容器内存的 70% | 留 30% 给 OS Page Cache |
| `worker_threads` | CPU 核数 | 太多会争锁，太少浪费 |
| `spill_to_disk` | true | 内存不够时落盘，避免 OOM |
| `shuffle_partitions` | 200~2000 | 太小倾斜，太小 IO 浪费 |
| `broadcast_threshold` | 10MB | 超过此值强制 Shuffle Hash |
| `enable_vectorized` | true | 列存引擎默认开启 |
| `query_timeout` | 300s | 防止单查询打爆集群 |

### 资源隔离

- YARN / K8s 队列：把 ETL、Ad-hoc、报表分队列，避免互相挤兑。
- Doris / StarRocks：使用 `resource group` 限制 CPU 与内存。
- ClickHouse：`max_concurrent_queries`、`max_memory_usage`。

### 监控指标

- 节点 CPU / 内存 / 磁盘 IO / 网络吞吐
- Query Profile：`ScanTime`、`JoinTime`、`ShuffleBytes`
- Slow Query 日志：按 P95 / P99 排序

---

## ch08 成本优化（CBO & 闭环验证）

现代 OLAP 引擎都带**成本优化器（CBO）**，它的输出质量取决于：

1. **统计信息**：行数、NDV、min/max、直方图。
2. **代价模型**：IO、CPU、网络的权重。
3. **计划空间**：是否枚举所有 Join 顺序、是否考虑关联子查询展开。

### 收集统计信息

```sql
-- DuckDB
PRAGMA enable_object_cache;
ANALYZE dwt.orders_by_date;

-- Trino / Hive
ANALYZE TABLE dwd.orders COMPUTE STATISTICS;
ANALYZE TABLE dwd.orders COMPUTE STATISTICS FOR COLUMNS user_id, order_date;

-- ClickHouse
ALTER TABLE dwt.orders UPDATE STATISTICS user_id;
```

### 闭环验证

`tests/test_tuning.py` 是调优的“护栏”：

1. **正确性**：所有布局 COUNT 相同，过滤聚合 SUM 一致（允许浮点 ULP
   抖动）。
2. **可执行性**：`tuning_demo.sql` 在每次 CI 上都能跑通。
3. **摘要视图**：`dwt.v_tuning_summary` 暴露所有布局，供 Capstone 与
   监控消费。

把基线 → EXPLAIN → 改一个变量 → 重测 → 落库 → 监控告警**这条流水线**跑
通，性能调优就不再是玄学，而是工程实践。本章结束。

---

## 运行方式

```bash
cd D:/work/project/learn/datawarehouse-learning
D:/env/anaconda3/python.exe -m pytest modules/17-tuning/tests/ -v
```

预期 4 个用例全部通过：

- `test_demo_script_runs_without_error`
- `test_layouts_preserve_row_count`
- `test_filtered_aggregates_are_layout_invariant`
- `test_summary_view_exposes_all_layouts`

并支持单独执行 `modules/17-tuning/src/tuning_demo.sql` 在任意 DuckDB 客户
端直接跑通，过程中所有 `EXPLAIN ANALYZE` 输出可重定向到日志做计划 diff。