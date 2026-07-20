# 第13章 数据湖（Data Lake）

> 从 Hive 数仓到湖仓一体（Lakehouse），最具代表性的开源表格式 —— Apache Iceberg、Apache Hudi、Delta Lake 与 Apache Paimon —— 把事务、模式演进与时间旅行能力带到了对象存储之上。本章系统讲清它们的原理、差异与选型方法。

---

## ch01 数据湖概念

数据湖（Data Lake）以对象存储（S3 / OSS / HDFS）为底座，把结构化、半结构化、非结构化数据以原始格式统一沉淀，再按需做模式管理。其初衷是解决传统数仓的两类痛点：

1. **数据孤岛**：Kafka 日志、IoT 报文、CSV 报表难以纳入同一治理体系；
2. **副本与延迟**：上游一份原始数据，ETL 一份增量，OLAP 再一份聚合，链路冗长且 T+1。

数据湖的早期形态（基于 Hive / Parquet）只解决了"低成本集中存储"，却把 ACID、模式与索引问题留给了上层引擎，导致湖与仓长期割裂。**湖仓一体（Lakehouse）** 通过引入表格式层（table format），把 ACID 事务、模式演进、时间旅行、统计与裁剪推到数据文件之上，从而让一份数据同时支撑 BI、流计算与机器学习。

---

## ch02 Iceberg 原理

Apache Iceberg 的核心抽象是**快照（snapshot）**：每个写入操作生成一个新的 snapshot，snapshot 记录了当时所有 data file 的清单。查询时通过 `snapshot-id` 或 `timestamp` 选定一个时间点，由 planner 把 manifest list 展开成 manifest，过滤出真正命中的 data file。

关键设计：

- **三层元数据**：catalog → metadata.json → manifest list → manifest → data file。每层都是不可变的，便于缓存与并发。
- **隐藏分区（hidden partitioning）**：用户写入时声明分区变换（如 `days(ts)`、`bucket(16, id)`），读取时引擎根据 spec 自动构造裁剪谓词，无需在 SQL 中重复声明分区列。
- **元数据独立**：Iceberg 不依赖 Hive metastore，可以用 Glue / Nessie / Polaris / 自带的 JDBC catalog，迁移成本低。
- **列级统计（column-level stats）**：每个 manifest entry 携带每列的 lower/upper bound 与 null count，planner 可在 manifest 层直接做 predicate pushdown，省掉大量 data file 的读 IO。这是 Iceberg 扫描速度优于 Hive 原生表的根本原因之一。
- **分区演进（partition spec evolution）**：通过 spec id 区分多套分区规范，老分区文件继续可读，写入按最新 spec 进行，避免一次性重写历史数据。

REST Catalog 出现后，Iceberg 把元数据读写封装为标准化的 HTTP/JSON 接口，引擎与底层 catalog 解耦，跨云迁移只换 endpoint 即可。多引擎共存（Trino + Spark + Flink + Dremio）也是 Iceberg 社区强调的核心卖点。

---
## ch03 Hudi 原理

Apache Hudi（Hadoop Upserts Deletes and Incrementals）把**记录级更新**作为一等公民。其设计原点是 CDC 场景：上游数据库每秒钟数千行变更，需要被近实时地摄入湖中，并支持按主键的去重、删除与增量读取。

Hudi 把数据组织成两类文件：

- **base file**：列式主文件（Parquet），每个 base file 关联一组 log file；
- **log file**：行式追加日志，记录自 base file 写入以来的增量变更（insert / update / delete）。

记录合并通过 `Record Merger` 完成，可配置为 `OVERWRITE`、`APPEND_ONLY`、`CUSTOM`。Hudi 提供两种表类型：

- **Copy-on-Write（COW）**：每次更新都重写整个 base file，查询快、写入慢；
- **Merge-on-Read（MOR）**：写入只追加 log file，读取时合并，读放大、写快。

Hudi 还有一个独特组件 **Timeline Service**：所有 commit / cleanup / compaction 都记录在时间线上，外部可通过 `hoodie.table.timeline` 查询历史的瞬时状态。

---

## ch04 Delta Lake

Delta Lake 出自 Databricks，最初作为 Spark 的存储层，后来以 Delta Universal Format（Delta UniForm）扩展到 Iceberg / Hudi 协议。其核心数据结构是 `_delta_log/` 目录下的 JSON 与 checkpoint Parquet 文件：

- 每个事务产生一个 JSON 文件（AddFile / RemoveFile），形成有序日志；
- 每 10 个事务做一次 checkpoint，把日志压缩为 Parquet 摘要，避免启动时回放过深；
- 通过 `OPTIMIZE` 触发小文件合并，通过 `Z-ORDER` 排序数据以提升多维查询的剪枝率。

Delta 的优势在于和 Spark 的深度集成：Structured Streaming 的 `foreachBatch`、CDC 流、`VACUUM` 回收过期文件、列映射（column mapping）支持等都是工业级打磨过的能力。

---

## ch05 Paimon

Apache Paimon 前身为 Flink Table Store，专为流批一体设计。它吸收了 Iceberg 的快照机制与 Hudi 的主键更新语义，并把 LSM（Log-Structured Merge-tree）引入湖存储：

- **写入路径**：先写主键排序的 Sorted Run 到 L0，再异步触发 compaction 形成 L1 / L2 …；
- **查询路径**：读取最新 snapshot，按层逐级合并；
- **删除向量（deletion vector）**：标记被删除的行，compaction 时回收，避免大表重写。

Paimon 天然贴近 Flink，对 CDC 摄取（Debezium / Maxwell / Canal）支持极好；其 bucket 表把数据按 hash 分桶，主键更新只需定位一个 bucket，写放大小。在国内大厂与 Flink 生态项目中，Paimon 的占比正在快速上升。

---
## ch06 ACID on lake

四种表格式都遵循同一套事务模型：乐观并发 + 多版本快照 + 原子提交。

| 能力 | 实现要点 |
| --- | --- |
| **原子性（Atomic）** | 提交前写入临时文件，commit 阶段原子地写元数据（如 Iceberg 替换 metadata.json） |
| **一致性（Consistent）** | 元数据切换是单一原子操作，读端要么看到旧快照要么看到新快照 |
| **隔离性（Isolation）** | snapshot 隔离（Iceberg / Delta / Paimon）或 record-level 互斥（Hudi OCC） |
| **持久性（Durable）** | 写入与元数据都落到对象存储，依赖底层 S3 / OSS 的持久性 |

并发提交通过乐观锁（version 号自增）解决冲突：两个写入同时提交，后到的发现 version 已变化就回滚自身文件并重试。在 S3 / OSS 上还会借助 `Conditional Put` 或类似的 `If-Match` 机制避免覆盖写丢失，确保 metadata.json 永远只有一个 winner。

事务隔离的另一个关键点是 **读取端不需要加锁**：任何 reader 都可以基于某个 snapshot-id 自由查询，writer 也不会阻塞它们。这种"读不阻塞写、写不阻塞读"的语义正是流批一体的基础 —— Flink 流任务和 Spark 批任务可以同时对同一张表跑不同时间的 snapshot，互不影响。

---

## ch07 Schema Evolution

模式演进是湖区别于传统数仓的关键能力：写入方加列、改类型、改顺序，读取方只要 projection 不涉及新列就能无感知地继续工作。

常见操作：

- **ADD COLUMN**：所有实现都原生支持，可选 DEFAULT，老 reader 看到 NULL；
- **DROP / RENAME COLUMN**：Iceberg 通过 column id 维持映射；Delta 通过列映射开关；Hudi 在新版本引入 schema reconciliation；
- **类型演进**（int → bigint、decimal 精度提升）：Iceberg 与 Delta 支持，需打开对应的 writer 标志；
- **分区演进**（partition spec evolution）：Iceberg 通过 spec id 实现，老分区文件继续可读。

`src/lake_demo.sql` 用 `ALTER TABLE ADD / RENAME / DROP COLUMN` 在 DuckDB 上演示了这一能力；真实 Iceberg / Delta 上的演进由表格式而非 DuckDB 来兜底。需要注意的工程细节：

- **列顺序（column ordering）**：把新列加在表尾，避免下游依赖 `SELECT *` 的脚本意外拿错位置；
- **默认值（default value）**：Iceberg / Delta 允许把 ADD COLUMN 写成 `WITH DEFAULT`，避免回填整张表；
- **回滚策略**：演进是单向的，最好在 CI 里固化 schema diff 审查；
- **视图兼容性**：模式演进后，历史 snapshot 的视图（已固化列序）依然有效，无需重建视图。

---

## ch08 选型建议

没有"最好"的湖格式，只有"最适合"的：

| 维度 | Iceberg | Hudi | Delta | Paimon |
| --- | --- | --- | --- | --- |
| 引擎中立 | 强 | 强（Spark/Flink 友好） | 中（Spark 最强） | 中（Flink 最强） |
| 主键更新 | 中 | 强 | 强 | 强 |
| CDC 摄取 | 中 | 强 | 强 | 强 |
| 隐藏分区 | 原生 | 通过表达式 | 通过 Z-Order | 原生 |
| 生态 | Trino / Spark / Flink | Spark / Flink | Spark / Databricks SQL | Flink / Spark |
| 成熟度 | 高 | 高 | 高 | 上升期 |

经验法则：

- 已有 **Trino + Spark** 体系、查询驱动、想兼顾 Hive 兼容 —— **Iceberg**；
- 写入量大、需要主键去重与近实时 CDC —— **Hudi** 或 **Paimon**；
- 与 Databricks / Spark 强绑定、看重治理工具链 —— **Delta**；
- 围绕 Flink 做流批一体 —— **Paimon**。

不要把选型当一次性决定。先用 Iceberg 跑通，再按业务压力逐步试点 Hudi / Paimon，最后用 Delta 补齐 BI 体验。湖格式之争的核心，是工程团队对一致性与灵活性的取舍。

---

## 配套示例

- `src/lake_demo.sql` —— 在 DuckDB 中模拟 Iceberg 时间旅行、模式演进与隐藏分区；
- `tests/test_lake.py` —— 4 个测试，覆盖 snapshot manifest、时间旅行、模式演进、分区裁剪。

运行：

```bash
cd datawarehouse-learning
python -m pytest modules/13-data-lake/tests/ -v
```