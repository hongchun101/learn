# 05｜执行原理与系统化性能调优

性能调优不是参数竞猜。固定正确性、数据、并发和硬件，沿“排队 → 计划 → 扫描 → 数据移动 → 算子 → 输出”找最大瓶颈。

## 1. 先定义 SLO 和基线

至少记录：

- 工作负载：SQL 集、参数分布、读写混合、并发、持续时间；
- 数据：行数、压缩字节、分区、基数、Top Key、冷热；
- 延迟：P50/P95/P99，而非一次耗时；
- 吞吐：QPS、导入 rows/s 与 MB/s；
- 资源：FE/BE CPU、内存、磁盘吞吐/延迟、网络、对象存储请求；
- 引擎：扫描行/字节、返回行、Exchange、PeakMemory、spill、排队、Compaction。

优化的目标可能冲突：低延迟、吞吐、鲜度和成本不能同时无限提高。

## 2. EXPLAIN 与 Profile

`EXPLAIN` 检查计划；Profile 检查实际执行。建议先在会话中开启 Profile，再通过 FE Web UI、系统表或当前版本提供的 Profile 命令获取。开关和查看语法会随版本变化，应以[Query Profile 文档](https://doris.apache.org/docs/4.x/query-acceleration/query-profile/)为准。

### 读计划

1. 分区/Tablet 裁剪；
2. Scan 谓词和索引；
3. 估算行数与列统计；
4. Join 顺序和分发；
5. 两阶段聚合、TopN、排序；
6. Fragment/Exchange 边界；
7. 物化视图是否透明改写。

### 读 Profile

先看时间树和最长 Fragment，再看：

- Scan：读取行/字节、过滤率、I/O 时间；
- Join：build/probe 行数、Runtime Filter、Hash 表内存；
- Exchange：发送/接收字节、等待、网络；
- Aggregate/Sort：输入输出、峰值内存、spill；
- 实例最大/最小差异：判断倾斜；
- Operator 等待与 CPU：区分算力、I/O、锁/队列。

不要看到某个指标大就改参数；先证明它位于关键路径。

## 3. CBO 与统计信息

成本优化器依赖表/列行数、NDV、NULL、Min/Max、直方图等。统计过期会导致错误 Join 顺序或 Broadcast 大表。

诊断链：

1. 比较计划估算行数与 Profile 实际行数；
2. 数量级偏差时检查统计是否存在、更新时间、采样是否覆盖倾斜；
3. 按当前版本执行 `ANALYZE TABLE`/统计管理；
4. 重新生成计划并比较，而不是永久依赖 Hint。

Hint 是诊断和紧急控制工具。若 Hint 显著改善，继续找统计、表达式、代价模型或数据分布根因。

## 4. Scan 优化

收益通常按以下顺序：

1. 减少分区；
2. 只选需要的列；
3. 谓词下推，避免不必要函数/隐式转换；
4. 调整排序 Key 和数据聚簇；
5. 针对已证明的谓词添加 Bloom/Bitmap/倒排等索引；
6. 用物化视图预计算稳定聚合。

计算放大比：

$$A = \frac{\text{扫描行数或字节}}{\text{返回行数或字节}}$$

高 $A$ 不一定错误（全局聚合本就高），但对点查和窄范围报表是强信号。

## 5. Join 策略

- **Broadcast**：小表复制到各执行节点；避免 Shuffle，但 build 表大时耗内存/网络。
- **Shuffle**：两侧按 Join Key 重分布；通用但网络代价高。
- **Bucket Shuffle**：利用一侧桶布局减少移动。
- **Colocate**：相关表相同分桶键、桶数和副本布局，消除 Join Shuffle；写入和调度约束更高。

选择依据是过滤后的实际大小，不是表名“维表/事实表”。

Runtime Filter 从 build 侧产生并下推 probe 侧。检查是否生成、是否等待过久、是否有效减少扫描。短查询等待 Filter 的成本可能超过收益。

### 倾斜

当不同实例耗时/行数相差悬殊：

- 找 Top Join/Group Key；
- 处理 NULL/默认值热点；
- 必要时对热点单独分支、盐化再二次聚合；
- 重选分桶键；
- 不能只增加并行度，因为热点仍在一个任务。

## 6. 聚合、Distinct、排序

- 让过滤尽早发生；
- 使用可局部聚合的表达式；
- 精确 Distinct 评估 Bitmap，允许误差则评估 HLL；
- `ORDER BY ... LIMIT` 可受益于 TopN 优化，仍需检查计划；
- 无 LIMIT 的全局排序是昂贵操作；
- 高基数 Group By 注意 Hash 表内存和 spill。

## 7. 物化视图

### 同步物化视图

与基表强一致，适合单表固定聚合/排序，加速透明改写。代价是每次导入维护，视图过多会拖慢写入。

### 异步物化视图

支持多表和更复杂预计算，适合可接受刷新延迟的报表。设计必须定义：刷新触发、分区映射、数据鲜度、失败重试、资源隔离、透明改写命中和回退查询。

上线门槛：目标查询命中率、节省的 CPU/扫描、刷新成本、存储、数据延迟都量化。只因某条 SQL 慢就建 MV，最终会得到无法维护的“索引动物园”。

## 8. 高并发点查与缓存

Unique Key 可配合行存和短路执行处理高并发主键点查。它不等于 OLTP：先用目标并发、更新比例和尾延迟压测。

缓存包括 SQL/结果类缓存、条件缓存、外表数据缓存和操作系统页缓存。必须分清：

- 缓存键和失效条件；
- 数据鲜度；
- 热/冷命中差异；
- 容量与淘汰；
- 集群扩容后的预热。

报告缓存性能时同时给命中率和冷缓存数据。

## 9. 资源与 Compaction

查询、导入、Compaction、Schema Change 争抢 CPU、内存和 I/O。现象可能是“查询偶发慢”，根因是写入小批导致 Compaction backlog。

检查：

- 是否与导入峰值/大批回灌同时间；
- BE 磁盘延迟与队列；
- Rowset/Segment 数量和 Compaction 分数；
- 内存水位、spill、GC/allocator 指标；
- Workload Group 的排队与限额。

先修批大小、数据分布和调度，再考虑调整 Compaction 参数；参数取值必须针对精确版本和硬件验证。

## 10. 标准调优闭环

```text
冻结 SQL 语义和结果校验
→ 固定数据/并发/缓存状态
→ 采集 EXPLAIN + Profile + 系统指标
→ 找关键路径最大项
→ 提出一个可证伪假设
→ 一次改一个主要变量
→ 重跑同样负载
→ 比较 P95/资源/正确性/写入影响
→ 保留或回滚，记录边界
```

## 11. 专家实验

选择一个百万级以上 Join + 聚合查询：

1. 基线运行 10 次；
2. 删除/过期统计，观察估算偏差（实验环境）；
3. 恢复统计，比较计划；
4. 制造 70% 热 Key，证明倾斜；
5. 从 Key/分桶、SQL 改写、MV 中选一个优化；
6. 报告正确性、P50/P95、扫描、Exchange、PeakMemory、导入影响；
7. 说明为何未采用另外两个方案。

## 12. 过关标准

面对慢 SQL，能在 30 分钟内给出证据链和下一项最小实验；禁止用“加资源”“加索引”“调并发”作为无证据首答。

参考：[性能与调优](https://doris.apache.org/docs/4.x/query-acceleration/performance-tuning-intro/)、[Join 优化](https://doris.apache.org/docs/4.x/query-acceleration/join-optimization-intro/)、[物化视图](https://doris.apache.org/docs/4.x/query-acceleration/materialized-view/)、[优化器原理](https://doris.apache.org/docs/4.x/query-acceleration/optimization-technology-principle/)。

下一章：[部署、可观测性与运维](06-operations.md)。
