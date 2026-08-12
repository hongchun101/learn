# 大数据专家之路:从 0 到 50K 月薪的系统化学习教程

> **适用人群**:有 Java/Python 基础,目标 1–2 年内进入一线/新一线公司担任大数据开发工程师 / 数据平台工程师 / 数仓架构师,月薪 50K。
> **方法论**:理论 → 源码 → 调优 → 故障 → 架构 → 行业落地。每章末尾配 "实战任务" 和 "专家面试题"。

---

## 1. 为什么 50K?

50K 在一线城市(北京/上海/深圳/杭州)对应 **P7 / 资深大数据开发 / 数仓 Leader** 的中位水平。市面 JD 调研的硬核要求:

| 维度 | 必会 | 加分 |
| --- | --- | --- |
| 语言 | Java 17、Scala、SQL、Python | Rust、Go |
| 存储 | HDFS、HBase、Kafka、Iceberg/Hudi/Paimon、Redis、Doris/StarRocks、Elasticsearch、ClickHouse | MinIO、Alluxio、Pulsar |
| 计算 | Spark/Flink 调优原理、YARN/K8s 资源调度、Presto/Trino | Ray、DuckDB |
| 架构 | Lambda/Kappa/Iceberg 湖仓一体、离线/实时数仓分层、DataOps | 存算分离、向量检索 |
| 治理 | 元数据(Hive Metastore / Apache Gravitino / DataHub)、血缘、质量、成本 | 数据资产化、数据安全 |
| 工程 | Docker / K8s、CI/CD、可观测(Prometheus / Grafana / Loki)、混沌工程 | Flink CDC / 湖仓一体迁移 |
| 软技能 | 性能调优、故障排查、上线交付、跨团队沟通 | 业务抽象、商业 Sense |

**核心结论**:50K ≠ 知识点数量,而是 *"看见问题能定位到源码层"*,这是与 20K–30K 的最大分水岭。本教程将围绕这一目标构建内容。

---

## 2. 学习路径(预计 12 个月 / 每天 2 小时)

```
        ┌─────────────────────────────────────────────────────────────┐
        │ 阶段 0:语言与基础(4 周)   → docs/01-foundation             │
        │   • Java SE 17、Scala 2.13/3.x、Linux、SQL                │
        │   • 分布式理论:CAP/BASE/一致性/共识/时钟                   │
        └─────────────────────────────────────────────────────────────┘
                                   │
        ┌─────────────────────────────────────────────────────────────┐
        │ 阶段 1:分布式存储(6 周)  → docs/02-storage                 │
        │   • HDFS 源码、NameNode HA、纠删码                        │
        │   • HBase、Kudu、Iceberg/Hudi/Paimon 三大湖格式          │
        └─────────────────────────────────────────────────────────────┘
                                   │
        ┌─────────────────────────────────────────────────────────────┐
        │ 阶段 2:分布式计算(8 周)  → docs/03-compute                 │
        │   • MapReduce → YARN → Spark 原理与调优                    │
        │   • Flink 流批一体、状态、Exactly-Once                    │
        │   • OLAP:Presto/Trino、Doris、ClickHouse                  │
        └─────────────────────────────────────────────────────────────┘
                                   │
        ┌─────────────────────────────────────────────────────────────┐
        │ 阶段 3:调度与消息(4 周) → docs/04-resource-messaging       │
        │   • YARN、Kubernetes、Docker、K8s Operator                 │
        │   • Kafka / Pulsar 深度、Airflow / DolphinScheduler       │
        └─────────────────────────────────────────────────────────────┘
                                   │
        ┌─────────────────────────────────────────────────────────────┐
        │ 阶段 4:架构与治理(6 周) → docs/05-architecture             │
        │   • Lambda / Kappa / Iceberg 湖仓一体                      │
        │   • 元数据、血缘、质量、DataOps                            │
        │   • 实时数仓 / 离线数仓真实案例                            │
        └─────────────────────────────────────────────────────────────┘
                                   │
        ┌─────────────────────────────────────────────────────────────┐
        │ 阶段 5:AI 与高薪(8 周) → docs/06-ai-expert                 │
        │   • LLM 时代大数据、向量数据库、湖仓 AI                    │
        │   • 性能调优、故障排查、成本治理                           │
        │   • 50K 岗位能力地图 / 简历 / 面试 / 案例                  │
        └─────────────────────────────────────────────────────────────┘
```

---

## 3. 目录索引(共 53 章)

### 3.1 基础篇 `docs/01-foundation/` (7 章)
- [00-课程介绍与学习方法论](./docs/01-foundation/00-introduction.md)
- [01-Java 基础与并发/GC 调优](./docs/01-foundation/01-java-concurrency.md)
- [02-Scala 基础与函数式编程](./docs/01-foundation/02-scala-functional.md)
- [03-Linux 与 Shell 高频命令](./docs/01-foundation/03-linux-shell.md)
- [04-SQL 进阶与数据仓库 SQL 模式](./docs/01-foundation/04-sql-advanced.md)
- [05-分布式理论:CAP/BASE/一致性/共识](./docs/01-foundation/05-distributed-theory.md)
- [06-计算机基础(网络/磁盘/内存/调度)](./docs/01-foundation/06-computer-basics.md)

### 3.2 存储篇 `docs/02-storage/` (8 章)
- [00-大数据存储总览](./docs/02-storage/00-storage-overview.md)
- [01-HDFS 原理与源码](./docs/02-storage/01-hdfs-internals.md)
- [02-HBase 架构与读写链路](./docs/02-storage/02-hbase-internals.md)
- [03-Kudu 与列存储对比](./docs/02-storage/03-kudu-column-store.md)
- [04-Iceberg 原理与生产实践](./docs/02-storage/04-iceberg-internals.md)
- [05-Hudi 原理与生产实践](./docs/02-storage/05-hudi-internals.md)
- [06-Paimon 原理与生产实践](./docs/02-storage/06-paimon-internals.md)
- [07-三湖对比与选型决策树](./docs/02-storage/07-lake-format-choose.md)

### 3.3 计算篇 `docs/03-compute/` (12 章)
- [00-大数据计算引擎演进史](./docs/03-compute/00-compute-history.md)
- [01-MapReduce 原理与源码](./docs/03-compute/01-mapreduce.md)
- [02-YARN 资源调度与源码](./docs/03-compute/02-yarn-internals.md)
- [03-Spark 核心原理(RDD/DAG/调度)](./docs/03-compute/03-spark-core.md)
- [04-Spark SQL 与 Catalyst/Tungsten](./docs/03-compute/04-spark-sql.md)
- [05-Spark 性能调优(内存/倾斜/Join/Shuffle)](./docs/03-compute/05-spark-tuning.md)
- [06-Flink 核心原理(StreamGraph/JobGraph/调度)](./docs/03-compute/06-flink-core.md)
- [07-Flink 状态、Checkpoint、Exactly-Once](./docs/03-compute/07-flink-state.md)
- [08-Flink SQL 与流批一体](./docs/03-compute/08-flink-sql.md)
- [09-Presto/Trino 原理与 MPP 引擎](./docs/03-compute/09-presto-trino.md)
- [10-Doris/StarRocks 原理与调优](./docs/03-compute/10-doris-starrocks.md)
- [11-ClickHouse 原理与生产实践](./docs/03-compute/11-clickhouse.md)

### 3.4 调度与消息 `docs/04-resource-messaging/` (9 章)
- [00-消息总线总览](./docs/04-resource-messaging/00-messaging-overview.md)
- [01-Kafka 架构与源码解析](./docs/04-resource-messaging/01-kafka-internals.md)
- [02-Kafka 调优与生产陷阱](./docs/04-resource-messaging/02-kafka-tuning.md)
- [03-Pulsar 与新一代消息系统](./docs/04-resource-messaging/03-pulsar.md)
- [04-Kubernetes 基础与大数据 on K8s](./docs/04-resource-messaging/04-k8s-basics.md)
- [05-Spark on K8s Operator 原理](./docs/04-resource-messaging/05-spark-k8s-operator.md)
- [06-Flink on K8s / Native K8s](./docs/04-resource-messaging/06-flink-k8s.md)
- [07-Airflow / DolphinScheduler 调度原理](./docs/04-resource-messaging/07-scheduler.md)
- [08-数据血缘与可观测性](./docs/04-resource-messaging/08-lineage-observability.md)

### 3.5 架构篇 `docs/05-architecture/` (10 章)
- [00-大数据平台架构演化](./docs/05-architecture/00-architecture-evolution.md)
- [01-离线数仓分层(ODS/DWD/DWS/ADS)](./docs/05-architecture/01-offline-warehouse.md)
- [02-实时数仓分层方案](./docs/05-architecture/02-realtime-warehouse.md)
- [03-Lambda 架构与 Kappa 架构](./docs/05-architecture/03-lambda-kappa.md)
- [04-Iceberg 湖仓一体方案](./docs/05-architecture/04-lakehouse.md)
- [05-元数据治理(Gravitino/DataHub/Unity Catalog)](./docs/05-architecture/05-metadata-governance.md)
- [06-数据质量与 SLA](./docs/05-architecture/06-data-quality.md)
- [07-DataOps 与 CI/CD](./docs/05-architecture/07-dataops.md)
- [08-案例:电商实时数仓 0→1](./docs/05-architecture/08-case-ecommerce.md)
- [09-案例:金融风控大数据平台](./docs/05-architecture/09-case-finance.md)

### 3.6 AI 与高薪进阶 `docs/06-ai-expert/` (8 章)
- [00-LLM 时代大数据工程师核心能力](./docs/06-ai-expert/00-llm-era-bigdata.md)
- [01-向量数据库与 RAG 系统](./docs/06-ai-expert/01-vector-db-rag.md)
- [02-性能调优三板斧(JVM/参数/Shuffle/IO)](./docs/06-ai-expert/02-performance-tuning.md)
- [03-故障排查清单(20+ 真实案例)](./docs/06-ai-expert/03-troubleshooting.md)
- [04-成本治理(存算分离/弹性/冷热分层)](./docs/06-ai-expert/04-cost-optimization.md)
- [05-50K 岗位能力地图与简历模板](./docs/06-ai-expert/05-job-50k.md)
- [06-高频面试题库(110+)](./docs/06-ai-expert/06-interview-bank.md)
- [07-学习资源与书单](./docs/06-ai-expert/07-resources.md)

### 3.7 代码与可运行示例 `code/` (7 个)
- `code/spark/`
  - [mapreduce-wordcount.scala](./code/spark/mapreduce-wordcount.scala) — WordCount + Combiner 对比
  - [skew-diagnose.scala](./code/spark/skew-diagnose.scala) — AQE + Salt Join 数据倾斜治理
  - [sql-tuning-aqe.scala](./code/spark/sql-tuning-aqe.scala) — Catalyst / AQE / Codegen / CBO 综合调优
- `code/flink/`
  - [cdc-mysql-to-doris.scala](./code/flink/cdc-mysql-to-doris.scala) — Flink CDC MySQL → Doris Exactly-Once
  - [sql-kafka-to-doris.scala](./code/flink/sql-kafka-to-doris.scala) — Kafka → Doris 实时数仓分层(MiniBatch + Lookup Join)
- `code/doris/`
  - [colocation-join.sql](./code/doris/colocation-join.sql) — Doris Colocation Join + Bucketed Shuffle + Bitmap
  - [clickhouse-mv.sql](./code/doris/clickhouse-mv.sql) — ClickHouse MergeTree 引擎族 + MV + Projection + TTL
- `code/docker/`
  - [docker-compose.yaml](./code/docker/docker-compose.yaml) — 一站式本地大数据环境(HDFS+YARN+Spark+Flink+Kafka+StarRocks+MinIO+监控)

---

## 4. 如何使用本教程

1. **顺序学习**:按目录顺序,每周完成一个阶段;每个章节末尾的 *实战任务* 必须亲自跑通。
2. **源码阅读**:教程中所有 *★ 源码层* 内容必须亲自打开 IDE 阅读。
3. **动手为先**:每个组件至少做一次 "三件套":本地部署 → 提交一条数据 → 调一次参数看影响。
4. **输出倒逼输入**:每章写 5–10 条 XMind 思维导图 + 一段卡片笔记。
5. **面试转化**:把每章末尾的 *专家面试题* 当作口头复述训练,卡顿即返工。

---

## 5. 学习纪律(不要破坏)

**Do**
- 每天 90 分钟代码 / 命令行,30 分钟理论笔记
- 每个组件至少经历一次 *故障演练*
- 每月一次 *模拟面试*(录音回放)

**Don't**
- 不要把 "看了视频" 等同于 "会了";必须亲手写 + 调
- 不要陷入 "装环境三天";推荐使用 Docker / 虚拟机标准化环境
- 不要在源码层欠债;调优 80% 的坑都源自不熟悉源码

---

## 6. 工具链

- **JDK**:OpenJDK 17(Eclipse Temurin)
- **Scala**:2.13.x(Spark 3.5 推荐)
- **Python**:3.11+
- **IDE**:IntelliJ IDEA 社区版
- **容器**:Docker 24+ / docker-compose v2
- **集群**(可选本地三节点):OrbStack / Multipass
- **调试**:Arthas、async-profiler、jvisualvm、FlameGraph
- **可观测**:Prometheus + Grafana + Loki + Tempo
- **本地环境**:见 [`code/docker/docker-compose.yaml`](./code/docker/docker-compose.yaml)

---

## 7. 量化指标(教程完成后应达成的硬指标)

| 模块 | 量化指标 | 验证方式 |
| --- | --- | --- |
| Java | 能写 Spark/Flink 自定义 UDF、不出现 JNI/CMS 错误 | 写一个 Kryo Serializer +1 个 Flink ProcessFunction |
| Spark | 能调优一个 10TB 作业,O(1 小时) | 报告 stage 吞吐 + skew 解决 |
| Flink | 能写出 Exactly-Once 端到端作业 | Flink CDC MySQL→Doris 复现 |
| Iceberg/Hudi/Paimon | 能解释 3 湖元数据差异,适合场景 | 在面试中做技术选型 |
| Kafka | 能定位 consumer lag 根因 | 演练 Topic Partition Lag |
| 架构 | 能独立设计 PB 级湖仓方案 | 高保真方案 + 实施步骤 |
| LLM | 能落一个 100M 向量 RAG | RAGAS ≥ 0.85 + QPS ≥ 50 |

---

## 8. 结语

教程从 0 到 50K 的核心不是 *知识容量*,而是 *源码深度 + 故障经验 + 架构能力 + 业务 Sense*。12 个月完成这套教程,典型学员月薪中位数 30K–55K(BAT/TMD/小米/小红书/Shopee/Karrot),P7 评级后 60K+。

> **本文是一个起点**,但成长靠的是你每天 2 小时,持续 365 天。
