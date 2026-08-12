# 00. 大数据计算引擎演进史:从 MapReduce 到 Doris

> **本章定位**:总览篇。把"为什么会出现 Spark、Flink、Presto、Doris"这条主线讲清楚,后面 11 章的每一处源码、参数、面试题,都可以在历史中找到它要解决的痛点。读完本章,你在面试时能用 5 分钟把整个计算生态的演化讲明白,这是 P7 的基本功。

---

## 1. 时代背景:为什么需要"分布式计算"

单机时代(2003 以前)的瓶颈非常直接:
- 1 TB 数据,单机的硬盘顺序读 ≈ 100 MB/s,需要 **3 小时**;带索引的随机查更慢。
- 内存再大(16 GB),也无法把全量数据装进去做 join、聚合。
- 解决思路只有两条:**垂直扩展(scale up)**——买更贵的服务器,EMC、Oracle Exadata;**水平扩展(scale out)**——堆几百台廉价 x86 + 一个能容错的编程框架。

Google 2004 年发表 *MapReduce: Simplified Data Processing on Large Clusters* 把第二条路标准化。Doug Cutting 用 Java 把它开源成 Hadoop,自此进入"分布式计算 1.0"。本章按时间线梳理每一代引擎的核心痛点和突破点。

### 1.1 评价"一代引擎"的四个维度

我们用同一个标尺去衡量每一代引擎,避免"新即是好"的偏见:

| 维度 | 含义 | 典型指标 |
| --- | --- | --- |
| **延迟(latency)** | 从数据进入到结果返回的时间 | 端到端 P99 |
| **吞吐(throughput)** | 单位时间处理的数据量 | GB/s 或 record/s |
| **表达力(API)** | 描述同样计算逻辑的代码量 | DAG 节点数 / LOC |
| **容错(cost of failure)** | 节点挂了恢复的代价 | 重算时长 / 数据丢失量 |

MapReduce 在表达力和容错维度满分,但延迟和吞吐差;Spark 用内存换延迟;Flink 用真正的流式换延迟;Doris 用列存 + 向量化换 OLAP 延迟。**没有任何引擎在四个维度上同时满分**,所以生产系统一定是多引擎混部。

---

## 2. 五代引擎全景图

```
                1.0 离线         1.5 DAG         2.0 内存迭代        3.0 流批一体       4.0 OLAP 向量化
              +-----------+   +-----------+   +-------------+   +-----------+   +-----------+
              | MapReduce |-->|    Tez    |-->|    Spark    |-->|   Flink   |-->| Doris/SR  |
              | 2004~2012 |   | 2013~2015 |   | 2014~至今   |   | 2016~至今  |   | 2017~至今  |
              +-----------+   +-----------+   +-------------+   +-----------+   +-----------+
                 离线批处理      DAG 通用框架      内存迭代计算        流批一体           MPP+向量
              (磁盘 shuffle)   (可重排 DAG)     (内存 shuffle)      (分布式快照)        (向量化执行)
                                       +------------+        +------------+
                                       |   Storm    |        | Presto/Trino|
                                       |  2013~2016 |        |  2013~至今  |
                                       +------------+        +------------+
                                          纯流式             联邦查询引擎
                                       (无状态/弱状态)       (无存储,只调度)
```

每一代不是简单替代,而是 **场景叠加**。2026 年的生产架构通常是:**Spark(离线批)+ Flink(实时流)+ Doris/StarRocks(OLAP 查询)+ Presto/Trino(联邦查询)** 多引擎混部,各取所长。

### 2.1 漏掉的两个分支
- **Storm(2013)**:Twitter 开源的纯流式引擎,Topology 由 spout/bolt 组成,毫秒级延迟,但没有 Exactly-Once、状态管理弱、吞吐低,被 Flink 取代。面试偶尔会问"Storm 和 Flink 的核心区别",答案在 **检查点机制 + 状态后端 + 窗口机制**。
- **Presto/Trino(2013~)**:Facebook 开源的"无存储 MPP 引擎",DataPass 模式,适合跨 HDFS/S3/Hive/Kafka/MySQL 的联邦查询。Trino 是 Presto 创始团队 2020 年 fork 的分支,SQL 方言更标准、社区更活跃。

---

## 3. 第一代:MapReduce(2004)

### 3.1 解决了什么
- **编程模型极简**:`map(k,v) -> list(k',v')` / `reduce(k', list(v'))`,两个函数搞定一切可拆分问题。
- **容错自动化**:基于心跳 + TaskTracker + JobTracker(后来拆成 YARN),进程挂了自动重跑。
- **数据本地性(data locality)**:调度器优先把 map task 调度到 HDFS block 所在节点,网络 IO 几乎为零。源码见 `org.apache.hadoop.mapred.JobInProgress#findNewMapTask`,核心字段 `dataLocalMaps` / `nonLocalMaps`,本地性命中率直接决定集群吞吐。
- **可靠性**:基于 HDFS 三副本,Block 丢失自动恢复。

### 3.2 留下了什么痛点
- **每个 job 两阶段写磁盘**:map 输出 -> 本地磁盘 -> 网络 fetch -> reduce 端 merge -> 第二次写 HDFS。一个 word count 跑完要 6 次 IO(原文论文图 2)。
- **DAG 表达力差**:MR1 不支持 join、union 等多阶段;Hive 把 SQL 转成 MR DAG 后,典型 join 任务拆成 4~6 个 MR,中间结果反复落盘。
- **延迟不可控**:一个 ETL 跑 4 小时是常态,**响应延迟小时级**,完全没法做"准实时"。
- **单点 JobTracker**:NameNode 单点 + JobTracker 单点(MR1),几千节点集群扛不住。
- **资源利用率低**:TaskTracker 静态内存槽位(map slot + reduce slot 分开),map slot 跑满时 reduce slot 闲置。

### 3.3 源码关键类
- `org.apache.hadoop.mapred.MapTask#run` — 写入 `MapOutputBuffer`(环形缓冲区,默认 100 MB,`io.sort.mb`)。
- `org.apache.hadoop.mapred.ReduceTask#run` — 三阶段 copy/merge/reduce。
- `org.apache.hadoop.mapreduce.Partitioner#getPartition` — 默认 `HashPartitioner`,决定数据落到哪个 reduce。
- `org.apache.hadoop.mapred.JobTracker` — MR1 中心调度器(MR2 拆为 YARN)。

### 3.4 一句话总结
> MapReduce 是 **分布式计算的 Hello World**——教会了世界怎么把任务拆到 1 万台机器上跑,但留下了"落盘慢 + DAG 表达弱"两个大坑。

---

## 4. 第二代:Tez(2013)

### 4.1 解决了什么
- **DAG 化执行**:Vertex + Edge 模型,一个 vertex 表示一个处理阶段,edge 表示 shuffle 通道。Hive/Pig 改用 Tez 后,典型 join 从 6 个 MR 压到 1 个 Tez DAG,**端到端延迟从 30 min 降到 5 min**。
- **Container 复用**:`ContainerReuse` 默认开启,Reduce 完成后 Container 不立刻释放,留给后续 vertex 用,省掉重复申请资源开销。
- **可重排 DAG(Reusable DAG)**:同一个 DAG 模板可在不同输入数据上反复跑,Impala/Hive LLAP 用这个做秒级响应。
- **事件驱动调度**:`TaskScheduler` 从 MR1 的"心跳拉模型"改成"事件推模型",延迟从秒级降到毫秒级。

### 4.2 留下了什么痛点
- **依然以磁盘为主**:Tez 默认 shuffle 还是落盘,内存 shuffle 需要手动开 `tez.runtime.shuffle.managed.enable=true`。
- **API 复杂**:面向框架开发者(Hive/Pig/Spark 移植层),普通用户写 Tez DAG 比写 MR 还累。
- **生态窄**:除了 Hive-on-Tez,几乎没有外部用户直接写 Tez 程序。
- **没有统一内存抽象**:Tez 的 memory manager 还是 JVM heap,YARN 容器粒度,容易 OOM。

### 4.3 源码关键类
- `org.apache.tez.dag.app.DAGAppMaster` — Tez 的 ApplicationMaster,负责解析 DAG、调度 vertex。
- `org.apache.tez.runtime.api.InputInitializer` — 输入初始化,处理数据源分片。
- `org.apache.tez.dag.api.EdgeManager` — 决定 vertex 间数据如何路由,对应 Spark 的 shuffle dependency。
- `org.apache.tez.runtime.task.TaskRunner` — 真正执行 vertex 的进程。

### 4.4 与 MR 的对比(以 Hive join 为例)

```
     MR DAG (4 个 job)                  Tez DAG (1 个 job)
                               
   Job1:ReduceSink         ┌─Vertex:ReduceSink─┐
   Job2:Map-Join           │  Vertex:Map-Join  │
   Job3:Reduce-Join        │  Vertex:Reduce    │
   Job4:Final-Select       └─Vertex:Select ────┘
   4 次写盘,4 次启动 AM       1 次写盘,1 次启动 AM
```

### 4.5 一句话总结
> Tez 是 **DAG 调度器的中间过渡**——把 MR 的"两阶段"变成了"N 阶段",但内存和 API 短板让 Spark 抓住机会弯道超车。

---

## 5. 第三代:Spark(2014)

### 5.1 解决了什么
- **内存迭代**:RDD 血缘(`lineage`)代替落盘,迭代机器学习 PageRank、K-means 100x 加速(Matei Zaharia 论文)。
- **统一编程模型**:一个 RDD/Dataset/DataFrame API 同时覆盖批处理、SQL、流(Structured Streaming)、ML、Graph,**一套语法打天下**。
- **DAGScheduler + TaskScheduler**:把 DAG 切成 Stage,Stage 内 pipeline(流水线),Stage 间 shuffle 落盘,兼顾内存复用与容错。
- **统一内存管理(Unified Memory)**:Execution + Storage 共享同一块堆,`spark.memory.fraction=0.6` 后两者动态抢占,避免 MR 时代"map slot 满、reduce slot 空"的浪费。
- **生态成熟**:Spark SQL、Hive-on-Spark、Spark Streaming、MLlib、Structured Streaming、Delta Lake/Iceberg 集成,2020 年后基本统治离线数仓。
- **Catalyst + Tungsten**:SQL 优化器 + 内存/CPU 极限优化(代码生成、堆外内存、SIMD)。
- **DataFrame API**:类 pandas 体验,Schema 推断 + Catalyst 自动优化,新手友好度远胜 RDD。

### 5.2 留下了什么痛点
- **微批流处理延迟高**:Spark Streaming 把流切成 micro-batch,典型延迟 100ms~秒级;Structured Streaming 的 continuous processing 模式(2.3+)虽然支持 ~1ms,但生产稳定度差。
- **Shuffle 大数据量仍写盘**:`SortShuffleWriter`(默认)在 map 数超过 `spark.shuffle.sort.bypassMergeThreshold=200` 时写磁盘 + 排序。
- **内存模型复杂**:`Execution Memory` / `Storage Memory` / `User Memory` 三块,`spark.memory.fraction=0.6`、`spark.memory.storageFraction=0.5` 一旦设错就 OOM。详见第 05 章。
- **Join 大表场景受限**:没有 partition pruning + broadcast hint,大表 join broadcast 会把内存打爆。
- **小文件问题**:DataFrame 写 Parquet 时,小 partition 生成小文件,HDFS NameNode 压力大。

### 5.3 源码关键类
- `org.apache.spark.scheduler.DAGScheduler#submitJob` — Job 提交入口,划分 Stage。
- `org.apache.spark.scheduler.TaskSchedulerImpl#submitTasks` — 任务调度,`LocalityWait` 决定数据本地性等待时间。
- `org.apache.spark.shuffle.sort.SortShuffleWriter#write` — 默认 shuffle writer,落盘 + 排序 + 文件合并。
- `org.apache.spark.sql.execution.SparkPlan#execute` — Spark SQL 执行算子。
- `org.apache.spark.sql.catalyst.optimizer.Optimizer#execute` — Catalyst 优化器,RBO 主战场。
- `org.apache.spark.memory.UnifiedMemoryManager#acquireStorageMemory` — 统一内存管理核心。
- `org.apache.spark.storage.BlockManager` — BlockManager,负责 RDD 数据块本地/远程读写。

### 5.4 Spark 各组件演化时间线

```
  2014    2016     2018     2020     2022      2024       2026
   │       │        │        │        │         │          │
   ▼       ▼        ▼        ▼        ▼         ▼          ▼
 Spark 1.0  1.6    2.0      2.4      3.0      3.3       3.5/4.0
    │       │       │        │        │         │          │
    │       │       │        │        │         │      ─AQE 默认开
    │       │       │        │        │         │      ─Adaptive Query
    │       │       │        │        │         │
    │       │       │        │        │     ─Dynamic Coalesce
    │       │       │        │        │      ─Shuffle Service
    │       │       │        │        │
    │       │       │        │    ─Spark on K8s GA
    │       │       │        │     ─Structured Streaming v2 API
    │       │       │        │
    │       │       │    ─Adaptive Query Execution(AQE)
    │       │       │     ─Barrier Execution
    │       │       │
    │       │    ─Project Tungsten
    │       │     ─Whole-stage Codegen
    │       │
    │    ─DataFrame API 成熟
    │     ─SparkSQL GA
    │
  ─RDD API
   ─Standalone Cluster
```

### 5.5 一句话总结
> Spark 是 **内存 + DAG + 统一 API** 的集大成者,把"离线数仓"这件事做到极致,但留下了"真流式"的空缺,被 Flink 补上。

---

## 6. 第四代:Flink(2016)

### 6.1 解决了什么
- **真正的流式(first-class stream)**:把"流"作为一等公民,批只是流的特例(有限流)。每条数据走 pipeline,延迟毫秒级,吞吐反而比 Spark Streaming 高。
- **精确一次(Exactly-Once)**:基于 Chandy-Lamport 分布式快照算法,`Checkpoint` 算子状态 + 数据源偏移 + 输出屏障一起原子提交。
- **流批一体 API**:`DataStream` 和 `Table` 共享同一套运行时,批流 SQL 同语法(`Tumble`/`Hop`/`Session` 窗口)。
- **状态后端可插拔**:`MemoryStateBackend` / `FsStateBackend` / `RocksDBStateBackend`,TB 级状态不是问题。
- **强大的窗口语义**:事件时间(Event Time) + 水位线(Watermark) + 滚动/滑动/会话窗口,处理乱序事件语义完整。
- **反压机制(Backpressure)**:基于 MailBox 单线程 + TCP 滑动窗口反压,从 1.5 起切换到 credit-based 反压,避免缓存穿透。
- **savepoint 与版本管理**:用户可手动触发 `savepoint` 做版本回滚、并行度调整、A/B 测试。

### 6.2 留下了什么痛点
- **状态变大后吞吐下降**:RocksDB 状态膨胀到 TB 级,compaction 抖动会拉长 checkpoint。
- **流批一体 ≠ 流批同价**:批作业跑在流式引擎上,某些场景性能比纯批引擎低;需要权衡延迟与吞吐。
- **运维门槛高**:Watermark、Idleness、反压、Pinned Checkpoint、`Incremental Checkpoint` 等概念,一个生产集群至少需要 2~3 个高级开发。
- **State Schema 演进麻烦**:State 类加了字段,老作业迁移容易出现 `StateMigrationException`。
- **小批量延迟反而更高**:几百条/秒的数据,Flink 启动开销比 Spark 还大。

### 6.3 源码关键类
- `org.apache.flink.streaming.api.graph.StreamingJobGraphGenerator` — 把 StreamGraph 转 JobGraph。
- `org.apache.flink.runtime.taskexecutor.TaskExecutor` — 真正跑 task 的进程,对应 Spark 的 Executor。
- `org.apache.flink.streaming.runtime.tasks.StreamTask#invoke` — 核心执行循环,**MailBox 模型**(单线程 + 邮件队列)反压机制的核心。
- `org.apache.flink.runtime.state.CheckpointCoordinator#triggerCheckpoint` — 分布式快照协调器。
- `org.apache.flink.streaming.connectors.kafka.FlinkKafkaConsumer` — Kafka Source,checkpoint 持久化 offset。
- `org.apache.flink.table.runtime.generated.GeneratedFunction` — Flink SQL 代码生成入口。

### 6.4 Flink 与 Spark Streaming 的事件时间/水位线

```
  事件时间 vs 处理时间(Process Time vs Event Time)
  
  Source ────► Operator A ────► Window ────► Operator B ───► Sink
   │             │              │             │              │
   │  ──W(10)──►│  ──W(12)───► │             │              │
   │             │              │             │              │
   └── 处理时间 = 算子 wall clock,容易漂
   └── 事件时间 = 数据自带时间戳,Flink 默认用它做窗口
   └── 水位线(Watermark) = "我估计时间 ≤ T 的数据到齐了"
```

### 6.5 一句话总结
> Flink 是 **真正把"流"做成一等公民** 的引擎,Exactly-Once + 事件时间让它在金融、IoT、推荐实时特征场景几乎不可替代。

---

## 7. 第五代:Doris / StarRocks / ClickHouse(2017~)

OLAP 场景和离线 ETL 是两类问题:ETL 关心吞吐和稳定性,OLAP 关心 **亚秒级响应 + 高并发 + 任意维度分析**。所以单独演化出一族 **向量化 MPP 数据库**。

```
+----------------+      +----------------+      +----------------+
|   Doris / SR   |      |   ClickHouse   |      |   Presto/Trino |
|  MySQL 协议    |      |  自家 SQL 方言   |      |  ANSI SQL      |
|  FE+BE 架构    |      |  MergeTree 引擎 |      |  Coordinator+  |
|  向量化+CBO    |      |  向量化+LSM     |      |  Worker 联邦   |
+----------------+      +----------------+      +----------------+
   实时数仓首选            日志/埋点首选          跨源联邦查询首选
```

### 7.1 Doris / StarRocks 解决了什么
- **MySQL 协议兼容**:业务方用 MySQL Client 直连,改造成本极低。
- **向量化执行 + CBO**:CBO + 代价模型(`StatisticsCache`)+ 公共子表达式消除 + Codegen,简单查询 100ms 以内返回。
- **实时写入 + 即时分析**:`Stream Load` 10 万条/秒,`Routine Load` 从 Kafka 消费,写入即可查。
- **高并发点查**:副本数可调,Tablet 级别分桶,MySQL 协议下 1 万 QPS 单节点无压力。
- **Colocation Join / Bucketed Join**:把 join key 相同的 tablet 放到同一组 BE 上,避免跨节点 shuffle。
- **Bitmap/HLL 预聚合**:精确去重 / 近似去重,Doris/SR 都内置 HLL/bitmap_union 函数。

### 7.2 ClickHouse 解决了什么
- **列存 + LSM + 向量化**:单表查询压缩比 1:10,聚合性能极致。
- **MergeTree 引擎族**:`ReplacingMergeTree` / `AggregatingMergeTree` / `CollapsingMergeTree` 等覆盖各种去重/聚合/折叠场景。
- **Projection**:在原表外额外维护一组列/排序,加速某些固定查询,比"建表时选好 ORDER BY"灵活。
- **Materialized View**:聚合表的"实时版",写入同时增量聚合,延迟秒级。

### 7.3 Presto/Trino 解决了什么
- **联邦查询**:一个 SQL 跨 Hive/Iceberg/Hudi/MySQL/Kafka/MongoDB,Connector SPI 抽象让插件化变得简单。
- **无状态 Worker**:Coordinator 调度 + Worker 执行,Worker 挂了直接换一台;扩展靠加机器。
- **Pipeline 模型**:把 Volcano 模型的"一行一行拉"改成"批 + 异步",内存翻倍释放。

### 7.4 留下了什么痛点
- **Doris/SR 的 Join 大表性能**:大表 join 没有 partition pruning 会触发 broadcast,内存炸。
- **ClickHouse 更新弱**:`ReplacingMergeTree` 异步合并,强一致读要加 `FINAL`,性能下降 5~10x。
- **三类引擎并存**:Presto/Trino 联邦查询很香,但底层要 hive/iceberg/jdbc/kafka 多 Connector,运维成本高。
- **OLAP 引擎的事务能力弱**:Doris 单表事务 OK,跨表事务靠 partial update;ClickHouse 几乎没有事务;Presto 取决于底层。

### 7.5 源码关键类(Doris)
- `org.apache.doris.nereids.Planner` — Nereids 查询计划器,基于 cascades 框架的 CBO。
- `org.apache.doris.service.FrontendServiceImpl` — FE 入口,MySQL 协议解析。
- `org.apache.doris.planner.PlanNode` — 执行计划节点,对应 Volcano 模型的 Operator。
- `org.apache.doris.be.load.StreamLoadPlanner` — Stream Load 入口。
- `org.apache.doris.qe.StmtExecutor` — SQL 执行器,串联 parser → planner → scheduler → result writer。
- `org.apache.doris.catalog.Tablet` — 副本管理单元。
- `org.apache.doris.common.util.VectorizedUtil` — 向量化执行开关。

### 7.6 源码关键类(ClickHouse)
- `DB::InterpreterSelectQuery::executeImpl` — SELECT 主入口。
- `DB::MergeTreeData::read` — 读取合并后的 part。
- `DB::MergeTreeDataWriter::writeTempPart` — 写入临时 part,后台 `MergeMutateTask` 合并。
- `DB::StorageReplicatedMergeTree` — 副本同步(ZooKeeper 协调)。
- `DB::Pipeline::execute` — Pipeline 执行模型。

---

## 8. 选型决策树(2026 生产视角)

```
                    你的数据/查询特征是什么?
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
    离线 T+1 ETL          实时事件流             OLAP 即席查询
   (日/小时级批量)        (毫秒/秒级延迟)         (亚秒响应/高并发)
       │                      │                      │
       ▼                      ▼                      ▼
     Spark               Flink               ┌─────┴─────┐
    (3.5.x)             (1.18+)              │           │
                                    高并发点查          大宽表聚合
                                          │                │
                                        Doris/SR       ClickHouse
                                          │
                                     跨源联邦查询
                                          │
                                       Presto/Trino
                                       
                                ┌──── 也可考虑 ────┐
                                │                 │
                             湖仓一体           向量数据库
                          Iceberg/Paimon      Milvus/Qdrant
                          + Spark + Doris       (AI/RAG)
```

### 8.1 实际案例:电商订单数仓典型组合

| 层级 | 引擎 | 选型理由 |
| --- | --- | --- |
| 采集 | Flume / Kafka | 高吞吐缓冲 |
| 实时 ETL | Flink + Doris Stream Load | 秒级延迟 + 实时入库 |
| 离线 ETL | Spark on Iceberg | 成本低 + 模式演进 |
| 即席查询 | Doris / StarRocks | MySQL 协议 + 亚秒响应 |
| 大宽表扫描 | ClickHouse | 列存压缩比极致 |
| 跨源联邦 | Trino | 一份 SQL 跨 Hive/Iceberg/MySQL |

---

## 9. 生产实战清单(每个引擎跑一次)

| 引擎 | 必做实验 | 推荐工具 |
| --- | --- | --- |
| MapReduce | wordcount + 自定义 Partitioner + Combiner | `hadoop jar` |
| Tez | Hive-on-Tez 跑 TPC-H q3,对比 Hive-on-MR 性能 | `hive --hiveconf hive.execution.engine=tez` |
| Spark | `spark-submit` 跑 TPC-DS q1 / q14,看 Stage 数 | `spark-ui:4040` |
| Flink | Kafka -> Windowed Aggregation -> Doris | Flink Web UI |
| Doris | 100 万行表跑 point query + group by + 100 并发压测 | `mysqlslap` |
| ClickHouse | clickhouse-benchmark 跑 `SELECT ... GROUP BY` | `clickhouse-client` |
| Trino | 一条 SQL 跨 Hive + MySQL | `trino-cli` |

---

## 10. 专家面试题

1. **MapReduce 两次落盘问题,Spark 是如何避免的?** 
   *要点*:Spark RDD 血缘 + Stage 内 pipeline,中间结果放内存;只有 Stage 间 shuffle 才落盘(默认 `SortShuffleWriter`)。但若 Shuffle 数据量 > Executor 内存,仍要溢写磁盘。
2. **Tez、Spark、Flink 的 DAG 模型各自的特点?** 
   *要点*:Tez = 通用 DAG(可重排),Spark = 多 Stage DAG(Stage 内 pipeline + Stage 间 shuffle),Flink = 流式 JobGraph + MailBox 单线程。
3. **为什么 Flink 能做到 Exactly-Once,Spark 做不到?** 
   *要点*:Flink 基于分布式快照(Chandy-Lamport)+ Barrier 对齐,Spark 是 micro-batch 之间的 at-least-once + idempotent sink 模拟 exactly-once(写 Hive/Parquet 副本可能重复)。
4. **Doris 为何选择 MySQL 协议?** 
   *要点*:MySQL 生态最成熟,客户端(JDBC/proxy/BI 工具)直接复用;协议层由 FE 解析 → 转 BE RPC。
5. **OLAP 引擎为何都向量化?** 
   *要点*:CPU 主频上限撞墙,SIMD(AVX-512)一次性算 16 个 int32,内存带宽一次拉满。火山模型每行一个虚函数调用,CPU cache miss 严重。
6. **MapReduce 时代的 DataLine 本地性,Spark 怎么继承?** 
   *要点*:TaskScheduler 的 `LocalityWait`(PROCESS_LOCAL → NODE_LOCAL → RACK_LOCAL → ANY),超时后降级。源码 `TaskSchedulerImpl#resourceOffers`。
7. **Flink 状态后端为什么首选 RocksDB?** 
   *要点*:内存 backend 受 JVM 堆限制,TB 级状态必爆;RocksDB 落盘 + LSM,容量大、迭代快、增量 checkpoint 友好。
8. **ClickHouse 为何不擅长 UPDATE?** 
   *要点*:`MergeTree` 写新 part 后台合并,UPDATE 是 mutation(异步重写 part);同步读未合并数据需要 `FINAL`,代价高。
9. **Presto vs Doris 的本质差异?** 
   *要点*:Presto 是 **无状态查询引擎**(Coordinator + 无状态 Worker,数据在 HDFS/S3);Doris 是 **自包含 MPP 数据库**(FE+BE 自带存储)。Presto 强在联邦,Doris 强在实时。
10. **2026 年新数仓为何普遍用 Iceberg + Spark + Doris 组合?** 
    *要点*:Iceberg 提供 ACID + 模式演进;Spark 负责批 ETL(成本低);Doris 提供查询加速和实时 BI。三者各司其职,湖仓一体(lakehouse)落地形态。
11. **Doris 和 StarRocks 的关系?** 
    *要点*:StarRocks 是 Doris fork 出来的独立分支,StarRocks 在 CBO、向量化、Colocation Join 上更激进;Doris 后来合并 SR 的一些特性(Nereids)。面试会问"如果是你,选 Doris 还是 StarRocks",要答"看团队技术栈 + 是否需要实时高频写入"。
12. **Trino 为什么不用内存缓存结果?** 
    *要点*:Trino 设计原则是无状态 + 即席查询,引入缓存会让"数据陈旧"问题变复杂;但 Connector 层面可以接 Alluxio/Gluten 做中间层缓存。

---

## 11. 一张图回顾五代引擎

```
              延迟           表达力        容错         吞吐
              (低→高)        (弱→强)      (差→好)       (低→高)
MR             ★             ★★            ★★★★★         ★★★
Tez            ★★            ★★★           ★★★★          ★★★★
Spark(批)      ★★★           ★★★★          ★★★★          ★★★★★
Flink(流)      ★★★★★         ★★★★          ★★★★★         ★★★★
Spark SQL      ★★★★          ★★★★          ★★★★          ★★★★★
Doris/SR       ★★★★★         ★★★           ★★★           ★★★★(单查询)
ClickHouse     ★★★★★         ★★            ★★            ★★★★★(单查询)
Presto/Trino   ★★★★          ★★★★          ★★★           ★★★
```

---

## 12. 小结

- **每一代引擎的诞生,都是对上一代某个具体痛点的回应**——磁盘 IO、迭代慢、延迟高、并发弱。
- **没有"最好"的引擎,只有"最匹配"的组合**。50K 候选人面试时常挂在嘴边的"Spark 一定比 MapReduce 快"是错的,要能拆到具体业务、具体数据量、具体算子。
- **历史是面试的暗线**:任何"为什么这么设计"的问题,翻历史都能找到答案。
- **下一章 [01-MapReduce 原理与源码]**,我们从根上拆 MapReduce,看 Shuffle、Combiner、Partitioner 源码,理解 Spark/Flink 到底继承了什么、改进了什么。