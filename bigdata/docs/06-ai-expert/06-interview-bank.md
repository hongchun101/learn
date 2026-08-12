# 06 · 高频面试题库(100+ 道)

> **本题库覆盖**:Spark 25 / Flink 25 / Iceberg 10 / YARN/K8s 10 / Kafka 10 / SQL 10 / 数仓建模 10 / 综合(LLM/Vector/Cost) 10。
>
> **每题格式**:题干 → 要点 → 追问 → 参考答案(3–5 句)。
>
> **使用方法**:面试前 2 周每天 30 分钟口答;卡顿即翻底层原理。

---

## 模块 A:Spark(25 题)

### A1. Spark 的核心数据结构 RDD 是什么?和 DataFrame 区别?

**要点**:RDD 五大特性(分区列表、compute、依赖、partitioner、preferredLocation);DataFrame = RDD[Row] + Schema + Catalyst 优化器。

**追问**:RDD 不可变,那如何实现累加?
**参考答案**:RDD 是不可变的分布式弹性数据集,五大特性包括分区列表、compute 函数、依赖关系(宽窄)、Partitioner、preferredLocation。DataFrame = RDD[Row] + Schema + Catalyst 优化器,享受 CBO / 谓词下推等优化。累加通过 `reduceByKey` / `aggregateByKey` 等 action 触发,或 `accumulator` 变量实现全局聚合。追问时强调:"RDD 是逻辑概念,执行时会生成多个 Task 跑在不同 Executor 上"。

### A2. Spark 的宽窄依赖有什么区别?

**要点**:窄依赖 = parent → child 一对一(parent 一个分区只被 child 一个分区消费);宽依赖 = parent 一个分区被 child 多个分区消费(Shuffle)。

**追问**:DAG 怎么切割 Stage?
**参考答案**:窄依赖(OneToOne、RangeDependency)pipeline 流水线,不切开 Stage;宽依赖(ShuffleDependency)作为 Stage 边界。DAGScheduler 通过 `getParentStages` / `getMissingParentStages` 递归回溯,遇到 ShuffleDependency 就切分 Stage。生产上,**宽依赖是性能瓶颈**,必须关注 ShuffleRead / ShuffleWrite 数据量。

### A3. Spark 的 Shuffle 过程(Map 端 + Reduce 端)?

**要点**:Map 端 spill + merge;Reduce 端 fetch + merge + sort;SortShuffleManager 默认使用。

**追问**:为什么用 Sort 而不是 Hash?
**参考答案**:Map 端按 partition 排序后写 spill 文件,N 个 spill 文件合并成 1 个 output。Reduce 端 fetch 对应 partition 的 block,通过 Netty client 拉取,合并 + 排序。SortShuffleManager 优于 HashShuffle 是因为:①磁盘文件数 = map 任务数,不乘以 reduce 数;②排序后可溢写磁盘,避免 OOM。SortShuffle 还分 bypass(小 reduce 数走 hash 优化)和 tungsten(unsafe 内存优化)。

### A4. Spark 的内存模型(Storage Memory / Execution Memory)?

**要点**:统一内存管理,Storage = 缓存 RDD / DataFrame;Execution = shuffle / join / aggregation;边界动态调整(默认 0.5,但 Execution 可抢占 Storage)。

**追问**:为什么 Execution 内存容易 OOM?
**参考答案**:Storage Memory 缓存 RDD / DataFrame;Execution Memory 用于 shuffle / join / aggregation。1.6 后统一内存,边界可动态调整,但 Execution 可抢占 Storage,反之不可。Shuffle 大量临时对象会撑爆 Execution 内存,触发 spill 到磁盘,性能断崖下降。生产推荐:`spark.memory.fraction=0.6`(堆中内存占比),`spark.memory.storageFraction=0.5`(Storage 占 Unified Memory 比例)。

### A5. Spark 的几种 Join 策略?

**要点**:BroadcastHashJoin / SortMergeJoin / ShuffleHashJoin / BroadcastNestedLoopJoin;由 `JoinSelection` 决策。

**追问**:小表阈值怎么定?
**参考答案**:BroadcastHashJoin(小表广播)适合小表 < 100MB(`spark.sql.autoBroadcastJoinThreshold`),完全避免 Shuffle。SortMergeJoin 是默认,大表对大表最稳定。ShuffleHashJoin 适合中等表。BroadcastNestedLoopJoin 是最差,无 join key 才会用。生产调优:小表广播阈值上调到 100–200MB(`autoBroadcastJoinThreshold=209715200`),或 SQL hint 强制 `/*+ BROADCAST(t1) */` / `/*+ SHUFFLE_HASH(t1) */`。

### A6. 数据倾斜的根因和 4 种解决方案?

**要点**:Hash 分布不均;AQE / 盐值 / 热 key 拆解 / 两阶段聚合。

**追问**:怎么诊断数据倾斜?
**参考答案**:Hash 分布不均导致某个 Task 处理时间远超其他。Spark UI Stage 中 Task Duration 分布、Shuffle Read Size 分布、GC Time。解决:① AQE 自动 `spark.sql.adaptive.skewJoin.enabled=true`;② 盐值打散 `concat(rand()*100, key)`;③ 热 key 单独 filter 出来特殊处理;④ 两阶段聚合(局部 + 全局)。生产上**先用 AQE**,AQE 不行再手写。

### A7. Spark 的 AQE(Adaptive Query Execution)?

**要点**:Spark 3.0 引入;运行时根据统计信息调整:① 合并小分区(coalesce);② 处理数据倾斜(skewJoin);③ 切换 Join 策略(localShuffleReader)。

**追问**:AQE 在哪个阶段生效?
**参考答案**:AQE 在物理计划生成后、调度前生效。ExchangeReuse / OptimizeSkewedJoin / CoalesceShufflePartitions / OptimizeLocalShuffleReader 四个规则。生产必开 `spark.sql.adaptive.enabled=true`。Spark 3.5 进一步把 AQE 扩展到窗口函数 / 聚合拆分。追问时强调:**AQE 改变了 Spark "一次优化、多次执行"的传统**,允许 runtime 优化。

### A8. Spark Shuffle 调优关键参数?

**要点**:`spark.sql.shuffle.partitions`、`spark.shuffle.file.buffer`、`spark.reducer.maxSizeInFlight`、`spark.sql.adaptive.skewJoin.*`。

**追问**:Shuffle 文件太多怎么办?
**参考答案**:`spark.sql.shuffle.partitions=2000–4000`(按数据量),`spark.shuffle.file.buffer=64k–1m`(减少 spill),`spark.reducer.maxSizeInFlight=96m–256m`(reduce 拉取批次)。生产推荐 Apache Celeborn 替代本地 shuffle,off-heap 缓存 + 失败重试更稳。文件太多用 `spark.shuffle.consolidateFiles=true`(已废弃)或用 AQE 自动合并小 partition。

### A9. Spark 广播变量的原理和使用?

**要点**:`BroadcastManager` 把 Driver 端变量序列化后分发给每个 Executor,只读、缓存在 Executor BlockManager。

**追问**:广播变量 vs Accumulator?
**参考答案**:广播变量是只读分发,适合把小表或大字典下发到 Executor,避免每 Task 重新拉。Accumulator 是只写累加,适合全局计数。两者都是 Spark 共享变量的方式。广播变量超过 100MB 需调 `spark.broadcast.blockSize`,避免单 Block 过大。

### A10. Spark 的 Checkpoint 和 persist 区别?

**要点**:Persist 标记 RDD 持久化,血缘不切断;Checkpoint 把 RDD 写入 HDFS,**切断血缘**,容错更强。

**追问**:什么时候必须 Checkpoint?
**参考答案**:长血缘链(迭代算法如 KMeans、PageRank)必须 Checkpoint,否则 Driver 端堆栈溢出 / 重算成本高。Persist(默认 MEMORY_ONLY)复用 RDD 但血缘仍在,Task 失败可重算上游。生产上 Checkpoint 目录必须用 HDFS 或 S3,本地盘会被删。`sc.setCheckpointDir("hdfs://...")` + `rdd.checkpoint()`。

### A11. Spark on YARN 的部署模式?

**要点**:Client / Cluster;Client 模式 Driver 在客户端,Cluster 模式 Driver 在 AM。

**追问**:Cluster 模式 vs Client 模式怎么选?
**参考答案**:Client 模式 Driver 在客户端机器,适合交互式开发(spark-shell)、需要 Driver 输出到本地。Cluster 模式 Driver 在 YARN ApplicationMaster,适合生产作业(YARN 集群重启不丢 Driver)。生产 Spark Submit **必须用 Cluster 模式**,避免 Driver 单点。

### A12. Spark on K8s 的两种模式?

**要点**:Standalone(原生 K8s scheduler,Spark 3.x)+ Spark Operator(自研 CRD + Pod 模板)。

**追问**:Spark Operator 的优势?
**参考答案**:Standalone 模式 Spark 自管理 Driver/Executor Pod,K8s 只是资源池。Spark Operator 把 SparkApplication 定义为 CRD,Operator 自动创建 Driver + Executor Pod,支持 **gang scheduling**(Volcano / Kueue)、挂载 ConfigMap、动态 Executor 扩缩。生产推荐 Spark Operator,GitHub `kubeflow/spark-operator` 或 Google `spark-on-k8s-operator`。

### A13. Spark Streaming 和 Structured Streaming 区别?

**要点**:DStream API(基于 RDD)+ Structured Streaming(基于 DataFrame,事件时间 + 水位线)。

**追问**:Structured Streaming 怎么处理迟到数据?
**参考答案**:DStream 底层是 RDD,无 schema 优化,Exactly-Once 难保证。Structured Streaming 是 Spark 推荐的流处理,基于 DataFrame,支持事件时间 + 水位线 + 状态流式聚合。迟到数据通过水位线 + 窗口 + allowedLateness 处理。生产几乎全部用 Structured Streaming。

### A14. Spark 的 Catalyst 优化器?

**要点**:逻辑计划 → 优化规则(谓词下推 / 常量折叠 / 列剪裁)→ 物理计划(Join 策略选择 / 索引)→ 代码生成(Tungsten 全阶段代码生成)。

**追问**:Catalyst 的成本模型怎么用?
**参考答案**:Catalyst 分四阶段:Analysis(解析 + 绑定)、Logical Optimization(谓词下推、常量折叠、列剪裁)、Physical Planning(Join 策略、并行度)、Code Generation(Tungsten WSCG)。成本模型基于表/列统计信息(`ANALYZE TABLE`),选择最优 Join 策略。生产上跑 OLAP 必须先 `ANALYZE TABLE`,否则 Catalyst 选不到最优。

### A15. Spark Tungsten 的核心是什么?

**要点**:内存管理(off-heap)、二进制处理(unsafe)、全阶段代码生成(WSCG)。

**追问**:全阶段代码生成为什么快?
**参考答案**:Tungsten 是 Spark 性能的内核:① 堆外内存管理,避免 GC;② Unsafe 二进制操作,直接操作内存字节;③ Whole Stage Code Generation,把 SQL 算子编译成 JVM bytecode,消除虚函数调用。生产上开启 `spark.sql.codegen.wholeStage=true`。

### A16. Spark 的动态资源分配(Dynamic Allocation)?

**要点**:`spark.dynamicAllocation.enabled=true`,根据 Task 空闲度自动扩缩 Executor,需要 External Shuffle Service。

**追问**:Dynamic Allocation 失效怎么办?
**参考答案**:基于 ExecutorIdleTimeout / SchedulerBacklogTimeout 自动增减 Executor。必须配 `spark.shuffle.service.enabled=true`,否则 Executor 释放后 Shuffle 数据丢失。生产推荐用 K8s + Spark Operator,SparkApplication 支持 `spec.dynamicAllocation`。

### A17. Spark 的 Executor 内存配置?

**要点**:`spark.executor.memory` + `spark.executor.memoryOverhead` + `spark.executor.pyspark.memory`(PySpark 专属)。

**追问**:为什么 Executor 内存不超过 32GB?
**参考答案**:`spark.executor.memory` 是堆,`memoryOverhead` 是堆外(JVM 开销 + off-heap),YARN/K8s 资源计算两者相加。Executor 内存不要超过 32GB:① 超过 32GB 普通对象指针 8 字节,JVM 性能下降;② GC 压力增大;③ YARN container 大小可能超节点剩余内存。生产推荐 16–32GB 堆 + 4–8GB overhead。

### A18. Spark SQL 的执行流程?

**要点**:SQL → 解析 → AST → 逻辑计划 → 优化 → 物理计划 → RDD → DAG → Stage → Task。

**追问**:逻辑计划优化的关键规则?
**参考答案**:`SQL → Unresolved Logical Plan(Antlr 解析)→ Logical Plan(Analyzer 绑定)→ Optimized Logical Plan(Catalyst 优化)→ Physical Plan(Planner 生成)→ RDD → DAGScheduler 切 Stage → TaskScheduler 调度`。逻辑优化规则包括:谓词下推、列剪裁、常量折叠、Join 重排、子查询解关联、聚合下推。

### A19. Spark 的 Shuffle Hook 和 External Shuffle Service?

**要点**:ESS 是独立进程,`spark.shuffle.service.enabled=true` 时 Executor 不在本地存 Shuffle 文件,ESS 接管。

**追问**:为什么 K8s 时代 ESS 难用?
**参考答案**:ESS 是 YARN 时代的产物,K8s 时代每个 Executor 是 Pod,Pod 重启后 ESS 数据丢失。生产推荐 **Apache Celeborn** 替代 ESS,把 Shuffle 数据落对象存储(S3/OSS),off-heap 缓存,失败重试更稳。Celeborn 与 Spark 解耦,作为独立集群部署。

### A20. Spark 任务调度器(TaskScheduler)?

**要点**:FIFO / FAIR;SchedulerBackend 决定资源来源(YARN / K8s / Standalone)。

**追问**:FIFO vs FAIR 怎么选?
**参考答案**:TaskScheduler 决定 Task 分配到 Executor,FIFO 默认(同一 Job 优先),FAIR 支持多 Job 公平调度(`spark.scheduler.mode=FAIR`)。生产推荐 FAIR,小作业不被大作业阻塞。FAIR 需配 `spark-submit --conf spark.scheduler.allocation.file=fairscheduler.xml`,按 pool 配置权重。

### A21. Spark on K8s 的 Pod GC?

**要点**:`spark.kubernetes.driver.pod.deleteOnTermination=true`,任务结束删 Pod;否则残留。

**追问**:Executor Pod 一直 Pending?
**参考答案**:Driver Pod 结束后默认保留(方便看 log),`deleteOnTermination=true` 自动清理。Executor Pod Pending 通常是资源不足或镜像拉取慢,加 `spark.kubernetes.container.image.pullPolicy=IfNotPresent` + 节点预热镜像。

### A22. Spark 的 Hive 兼容性问题?

**要点**:时间戳时区 / null 行为 / 字符集 / 隐式类型转换。

**追问**:怎么解决?
**参考答案**:Hive 用 `java.sql.Timestamp` + 本地时区,Spark 用 `Instant` + UTC。`spark.sql.hive.convertMetastoreParquet=true` + `spark.sql.session.timeZone=UTC`。生产推荐统一用 UTC + ISO 8601 字符串时间戳。

### A23. Spark 3.5 的新特性?

**要点**:Spark Connect(RPC 客户端)+ Structured Streaming 自适应 + Celeborn 集成 + 增强 Profiler。

**追问**:Spark Connect 解决了什么?
**参考答案**:Spark Connect 把 Driver 端从胖客户端变成瘦客户端,Driver 端可以是任意语言(Go / Rust / Python),与 Executor 通过 gRPC 通信。解决了 Spark 客户端太重 + IDE 集成难的问题。生产推荐尝试,新项目优先用 Spark Connect。

### A24. Spark 的数据本地性(TASK_LOCAL / NODE_LOCAL / RACK_LOCAL / ANY)?

**要点**:TaskScheduler 按 LOCALITY 等级分配 Task,等待超时后降级。

**追问**:本地性差的原因?
**参考答案**:TASK_LOCAL(Task 与数据同 Executor)> NODE_LOCAL(同 Node)> RACK_LOCAL(同 Rack)> ANY(任意)。`spark.locality.wait` 默认 3s,超时降级。生产上 HDFS 块丢失、副本分布不均导致 NODE_LOCAL 命中率低。优化:① 增加 HDFS 副本;② Spark 调度器等待时间延长到 10s;③ 节点资源预留避免热点。

### A25. Spark 的执行计划怎么读?

**要点**:从下往上读,每个 Operator 看输入输出;`EXPLAIN EXTENDED` / `EXPLAIN COST` 看详细信息。

**追问**:读计划最关心什么?
**参考答案**:`EXPLAIN` 输出树形,从叶子节点(数据源)往上读。重点看:① Exchange(Shuffle 边界);② BroadcastExchange(广播变量);③ Sort / SortMergeJoin 排序操作;④ Aggregate 聚合。生产排错:**Exchange 越多性能越差**,优先消灭 Shuffle。

---

## 模块 B:Flink(25 题)

### B1. Flink 核心架构(JobManager / TaskManager / Client)?

**要点**:Client 提交 Job → JobManager(Dispatcher + ResourceManager + Dispatcher)→ TaskManager(Slot)。

**追问**:SlotSharing 是什么?
**参考答案**:JobManager 负责协调(JobGraph 调度、Checkpoint 协调、Failover);TaskManager 执行 Task,每个 TM 有 N 个 Slot。SlotSharing 让同一 Operator Chain 的不同算子共享 Slot,**降低并行度浪费**。生产配置:`taskmanager.numberOfTaskSlots = CPU 核数 / 2`。

### B2. Flink 的四层图(StreamGraph → JobGraph → ExecutionGraph → 物理执行)?

**要点**:StreamGraph(逻辑)→ JobGraph(优化合并)→ ExecutionGraph(并行实例化)→ 物理 Task。

**追问**:为什么 JobGraph 要合并 Operator Chain?
**参考答案**:StreamGraph 是用户 API 的逻辑图,Operator Chain 把相邻算子合并到一个 Task(forward 连接无 Shuffle),**减少线程 / 网络开销**。ExecutionGraph 按并行度实例化每个 vertex。生产调优:Chain 太长调试难,可用 `disableChaining()` 拆开。

### B3. Flink 的 Exactly-Once 怎么实现?

**要点**:Checkpoint barrier(Chandy-Lamport)+ 两阶段提交(2PC)+ 可重放 Source(Kafka offset)。

**追问**:Kafka → Kafka Sink Exactly-Once 配置?
**参考答案**:Checkpoint barrier 在数据流中传播,Source 持久化 offset,所有算子快照 state,等所有 barrier 对齐后提交。Sink 端用 TwoPhaseCommitSinkFunction,先 pre-commit 再 commit。Kafka Source 配 `setStartingOffsets(committedOffsets)` + Kafka Sink 配 `enable.idempotence=true` + `setLogPrefix` + 事务 ID。生产上必须 Exactly-Once,**at-least-once 会导致重复消费 / 状态错乱**。

### B4. Flink 的状态后端(MemoryStateBackend / FsStateBackend / RocksDBStateBackend)?

**要点**:Memory(开发)、FS(中等状态)、RocksDB(生产,TB 级)。

**追问**:RocksDB 怎么撑 TB 状态?
**参考答案**:RocksDB 是 LSM-Tree 引擎,内存 WriteBuffer + 磁盘 SSTable,后台 compaction 合并。State 序列化后写 RocksDB,内存占用 < Heap 大小,大状态(> 10GB)也可。`state.backend.incremental=true` 增量 checkpoint,只传新增。生产**几乎全用 RocksDB**。

### B5. Flink 的水位线(Watermark)?

**要点**:事件时间(业务时间)+ 水位线标记"某时间前的数据已到";处理时间 vs 事件时间。

**追问**:水位线乱序怎么处理?
**参考答案**:水位线是单调递增的"事件时间进度"标记,触发窗口计算。乱序用 `forBoundedOutOfOrderness(Duration.ofSeconds(5))` 容忍 5s 乱序;周期性水位线 `PeriodicWatermarkAssigner`;数据驱动 `PunctuatedWatermarkAssigner`。生产关键业务用 **idle source detection**,Source 空闲时水位线不再触发,避免下游空跑。

### B6. Flink 的反压机制?

**要点**:Netty 缓冲区 + Credit-Based 反压(5.x)+ 5.x 之前的 TCP 反压。

**追问**:反压怎么定位?
**参考答案**:数据从 Source 推到 Sink,Task 之间通过 Netty buffer 传输,buffer 满时上游主动降速。WebUI 反压面板:Source 端红 = 严重反压,黄 = 一般。Flink 1.13+ 用 Credit-Based 反压,网络层主动控制,比 TCP 反馈快。生产定位:WebUI + Metrics(`outPoolUsage`, `inPoolUsage`, `numRecordsOut`)。

### B7. Flink 的 Checkpoint 流程?

**要点**:JobManager 触发 barrier → Source 持久化 offset → 各算子快照 state → barrier 对齐 → 异步上传。

**追问**:Checkpoint 失败怎么办?
**参考答案**:Checkpoint barrier 在数据流中传播,所有并行实例收到后异步快照 state。失败原因:① 状态太大超过 timeout;② 外部存储(HDFS)不可用;③ 反压导致 barrier 卡死。`execution.checkpointing.timeout=600s`,失败策略 `FAIL_ON_CHECKPOINTING_ERRORS` / `RETAIN_ON_CANCELLATION`。

### B8. Flink Savepoint 和 Checkpoint 区别?

**要点**:Savepoint 手动触发,可修改并行度恢复;Checkpoint 自动,固定并行度。

**追问**:Savepoint 用于什么?
**参考答案**:Savepoint 是"人为触发的、格式兼容的、显式管理的"全局快照,可修改并行度、修改算子后恢复(Operator UID 必填)。Checkpoint 是 Flink 运行时自动周期快照,Job 升级后格式可能不兼容。生产升级 Flink Job 必须用 Savepoint。

### B9. Flink 的 SQL vs DataStream API?

**要点**:SQL 易用 + 自动优化;DataStream 灵活 + 定制 State。

**追问**:生产怎么选?
**参考答案**:Flink SQL 是 Flink 推荐的 API,自动优化 + Connector 复用 + 类型安全;DataStream API 用于复杂状态 / 自定义算子 / 性能极致场景。生产推荐 80% 业务用 Flink SQL + 20% 用 DataStream。SQL 写时必须建 Catalog(Hive / Generic),否则元数据难管。

### B10. Flink 的状态分类(KeyedState / OperatorState)?

**要点**:KeyedState(Value/List/Map/Reducing/Aggregating)按 key 分;OperatorState 算子级,扩缩容需 rebalance。

**追问**:扩缩容后状态丢失?
**参考答案**:KeyedState 按 key group 分片,扩缩容时 Flink 自动 rebalance,无丢失。OperatorState 需实现 `CheckpointedFunction` + `ListState` / `UnionState`,扩缩容时重新分发。生产上必须用 KeyedState,**OperatorState 难以扩展**。

### B11. Flink 的 TTL 配置?

**要点**:`StateTtlConfig` 配置过期时间 + 清理策略(INCREMENTAL_CLEANUP / ROCKSDB_COMPACTION_FILTER)。

**追问**:为什么必须配 TTL?
**参考答案**:state TTL 防止状态无限增长,默认永不过期。生产必须配,如 `state.ttl=7d,cleanupStrategy=ROCKSDB_COMPACTION_FILTER`。TTL 在 RocksDB 后端效果最好,LSM 合并时清理过期 key。

### B12. Flink 的窗口(Window)?

**要点**:滚动 / 滑动 / 会话 / 全局;事件时间 vs 处理时间。

**追问**:窗口迟到数据怎么算?
**参考答案**:事件时间窗口用 Watermark 触发,迟到数据通过 `allowedLateness` 容忍。窗口分类:滚动(Tumbling,无重叠)、滑动(Sliding,固定间隔重叠)、会话(Session,无活动时关闭)、全局(Global,所有数据一个窗口)。生产推荐 **事件时间 + Watermark + Tumbling**,简单可调试。

### B13. Flink CDC 是什么?

**要点**:基于 Debezium 的 MySQL / Postgres / Oracle binlog 增量同步,整库同步 + DDL 变更。

**追问**:CDC 启动慢怎么优化?
**参考答案**:Flink CDC 是 Debezium 封装,Snapshot(全量) + Binlog(增量)两阶段。大表启动慢的优化:① chunk size 调大;② 并发 snapshot;③ 关闭全量 snapshot 改增量。生产推荐先 snapshot 到 Iceberg 再接增量。

### B14. Flink 的 Source / Sink Connector?

**要点**:Kafka / Pulsar / MySQL CDC / Hive / Iceberg / Doris / ClickHouse。

**追问**:Kafka Source 怎么保证 offset 准确?
**参考答案**:Flink 官方提供 `KafkaSource` / `KafkaSink`,自动管理 offset + Checkpoint。`setStartingOffsets(committedOffsets)` 启动时恢复,`setBoundedness(CONTINUOUS_UNBOUNDED)` 持续流。生产 Kafka Source 配 `isolation.level=read_committed` + `setCommitOffsetsOnCheckpoints(true)`。

### B15. Flink 的 Catalog?

**要点**:Hive Metastore / Generic;统一元数据;支持 SQL DDL。

**追问**:为什么必须配 Catalog?
**参考答案**:Catalog 统一管理 Kafka / Hive / Iceberg / MySQL 元数据,SQL `CREATE TABLE` 自动注册。生产推荐 Hive Catalog 复用 HMS,或 Apache Gravitino / Polaris(开源 Iceberg REST)。无 Catalog 作业无法跨 SQL 作业共享元数据。

### B16. Flink on YARN / K8s?

**要点**:YARN Session / Per-Job / Application;K8s Native / Operator。

**追问**:生产用哪种?
**参考答案**:YARN 模式:Session(集群复用,适合多小作业)、Per-Job(独立 Job,资源隔离好)、Application(每个 Application 独立 JM,推荐)。K8s 模式:Native K8s(裸部署,推荐)、Flink Kubernetes Operator(CRD 管理)。生产推荐 **K8s Operator**(易扩缩 + 集成 ArgoCD)。

### B17. Flink 的内存模型(TaskManager Heap)?

**要点**:Network Buffers + Managed Memory + JVM Heap + Off-heap。

**追问**:Memory 划分比例?
**参考答案**:TaskManager Heap 分四块:① Network Buffers(Netty 数据传输,默认 10%);② Managed Memory(RocksDB / Sort,默认 40%);③ JVM Heap(用户代码,UDF / DataStream);④ Off-heap(unsafe / direct)。生产调优:`taskmanager.memory.managed.fraction=0.4`(Managed 占比),`taskmanager.memory.network.fraction=0.1`(Network 占比)。

### B18. Flink 的 Time 语义?

**要点**:事件时间(Event Time)+ 处理时间(Processing Time)+ 摄入时间(Ingestion Time)。

**追问**:生产用哪种?
**参考答案**:生产几乎全用 **Event Time**(业务时间),通过 Watermark 推进。Processing Time 适合实时性要求极高、容忍数据乱序的业务。Ingestion Time 是 Source 处理时间,极少用。

### B19. Flink 的 ProcessFunction?

**要点**:低阶 API,访问 state + 定时器 + watermark。

**追问**:KeyedProcessFunction 怎么用?
**参考答案**:`ProcessFunction` 是 Flink 最强 API,可同时访问 state、定时器、watermark。`KeyedProcessFunction` 按 key 处理,可注册事件时间定时器(`registerEventTimeTimer`)处理延迟数据。生产复杂业务(如风控)必须用 `KeyedProcessFunction`。

### B20. Flink 的 Join?

**要点**:Window Join / Interval Join / Temporal Table Join / Regular Join(SQL)。

**追问**:流流 Join 怎么处理迟到?
**参考答案**:Window Join 必须双流落入同一窗口;Interval Join 是带边界的区间 Join(b.keytime BETWEEN a.time - 1h AND a.time + 1h);Temporal Table Join 是维表关联(查最新版本);SQL 的 Regular Join 双流无界,会持续膨胀 state,生产推荐 Interval Join + Temporal Table Join。

### B21. Flink 的维表关联(Async IO)?

**要点**:同步阻塞 vs 异步查询(AsyncFunction)。

**追问**:维表查询慢怎么办?
**参考答案**:同步阻塞会拖慢 Checkpoint barrier 对齐。生产用 `AsyncFunction` + `RichAsyncFunction`,异步线程池查 HBase / MySQL + LRU Cache。配置:Capacity = 并发 × 2,Timeout 5s,失败重试。

### B22. Flink 的自定义 Connector?

**要点**:实现 `SourceFunction` / `SinkFunction`;RichFunction 提供生命周期方法(open/close)。

**追问**:Source 怎么实现 exactly-once?
**参考答案**:继承 `SourceReader` / `Source` 接口(Flink 1.13+ 的新 Source API),实现 `snapshotState` / `restoreState` 持久化 offset / position。生产推荐用新 Source API(FLIP-27),灵活支持 split / watermark / 事件时间。

### B23. Flink 的部署模式对状态恢复的影响?

**要点**:Application 模式独立 JM;Per-Job / Session 共享 JM。

**追问**:K8s 上怎么选?
**参考答案**:Application 模式每个 Flink Job 独立 JM,失败重启不影响其他 Job,生产推荐。Per-Job YARN 模式同样独立,Session 模式共享(适合多小作业)。K8s Native 模式裸部署,Operator 模式 CRD 管理。

### B24. Flink 的网络栈?

**要点**:Netty 客户端 + Netty 服务器 + 反压机制(Credit-Based)。

**追问**:为什么用 Netty 而不是 Akka?
**参考答案**:Flink 1.5 后网络栈用 Netty,代替之前的 Akka。原因:Netty 性能更好,无 Actor 模型复杂,IO 优化空间大。Credit-Based 反压(Flink 1.13+)通过网络层主动控制,比 TCP 反馈快。

### B25. Flink 的失败恢复(Failover)?

**要点**:Task 失败 → 上游重启;JobManager 失败 → 全部重启。

**追问**:怎么减少重启范围?
**参考答案**:Task 失败默认重启整个 Job;Region 策略(`restart-strategy`)按 Region 重启,只重启相关 Operator。生产配置:`restart-strategy=fixed-delay`,`restart-attempts=5`,`delay-between-attempts=10s`。**State 必须可恢复**(Checkpoint / Savepoint)。

---

## 模块 C:Iceberg(10 题)

### C1. Iceberg 的表结构(TableMetadata / Manifest / ManifestList / Data File)?

**要点**:TableMetadata(JSON)→ Snapshot → ManifestList → Manifest(Avro)→ Data File(Parquet)。

**追问**:Iceberg 的元数据在哪?
**参考答案**:TableMetadata 是 Iceberg 表的根元数据,JSON 格式存在对象存储,记录 `schema` / `partition spec` / `snapshots`。每个 Snapshot 关联一个 ManifestList,列出该 Snapshot 的 Manifest 文件。每个 Manifest 记录若干 Data File + 列统计信息(min/max/null count)。元数据**全部在对象存储**,无外部 Metastore 依赖(Hive Metastore 只存指针)。

### C2. Iceberg 的隐藏分区(Hidden Partition)?

**要点**:按 transform(bucket/year/month/day/hour)分区,但查询**不需要指定 partition 列**。

**追问**:为什么叫"隐藏"?
**参考答案**:Iceberg 分区是列的 transform,如 `partition_spec = days(ts)`,查询 `WHERE ts BETWEEN ...` 自动推导分区。无需 `WHERE dt = '...'`。生产上**所有 Iceberg 表都用隐藏分区**,避免业务方写错 partition 列。

### C3. Iceberg 的 Snapshot / Time Travel?

**要点**:每次 commit 生成 Snapshot,记录 state;`AS OF TIMESTAMP` / `VERSION AS OF <snapshot-id>` 回溯。

**追问**:Time Travel 的应用场景?
**参考答案**:每次 commit 生成 Snapshot(atomic),记录 data files + delete files + statistics。Time Travel 用于:① 回滚错误写入;② 离线评测对比新旧数据;③ 审计。生产配 `snapshot.retention.min=5, snapshot.retention.max=100`,定期清理旧 snapshot。

### C4. Iceberg 的 Schema Evolution?

**要点**:Add / Drop / Rename / Reorder / Update 类型(限 widen);Schema ID 区分版本。

**追问**:类型变更有什么限制?
**参考答案**:Iceberg 支持 add / drop / rename / reorder 列,类型可"宽变"(int → long),不可"窄变"(string → int)。每次变更 Schema ID +1,旧数据仍按旧 Schema 读。生产上推荐 **add 列** + 写新数据,**不改老列**,避免查询逻辑混乱。

### C5. Iceberg 的三种表格式(V1 / V2 / V3)?

**要点**:V1(基础)+ V2(Row-level Delete: position delete + equality delete)+ V3(2024 默认,增强 Delete + Encryption)。

**追问**:V2 的 Delete 怎么工作?
**参考答案**:V1 只支持 Copy-on-Write,删除 = 写新文件。V2 增加 Row-level Delete,支持 position delete(标记某行被删)+ equality delete(按值删),实现 Merge-On-Read。V3 进一步优化 Delete + 增加 Encryption + Default Sort Order。生产上 Flink CDC 入 Iceberg 必须用 V2。

### C6. Iceberg 的 Sort Order?

**要点**:`sort_order = zorder(col1, col2)` 或 `sort_order = col1 ASC NULLS FIRST`;`rewrite_data_files` 应用。

**追问**:Sort Order 的好处?
**参考答案**:Sort Order 让数据物理排序写入,Parquet Row Group 的 min/max 统计有效,**查询时谓词下推剪枝更多文件**。Z-Order 多维排序,空间局部性更好。生产推荐**所有表配 Sort Order**,定期 `rewrite_data_files` 整理。

### C7. Iceberg 的写入优化?

**要点**:`write.target-file-size-bytes`(默认 128MB)+ `write.parquet.compression-codec=zstd` + `write.distribution-mode`(hash / range / none)。

**追问**:Distribution Mode 怎么选?
**参考答案**:Distribution Mode 影响并行写入:`hash`(按 partition 列 hash,避免文件冲突)+ `range`(按 partition 列排序,适合 Sort Order)+ `none`(适合单分区)。生产推荐 **hash + 128MB target size + ZSTD**。

### C8. Iceberg 的小文件治理?

**要点**:`rewrite_data_files` + `remove_orphan_files` + `expire_snapshots`。

**追问**:为什么 Iceberg 也会有小文件?
**参考答案**:即使 Iceberg 默认 128MB,Flink 流式写入 + 高频 commit 仍会产生大量小文件。治理:① `rewrite_data_files` 把小文件合并成大文件;② `remove_orphan_files` 清理无引用的孤儿文件(写入失败残留);③ `expire_snapshots` 清理过期 snapshot。生产推荐 **每日一次自动重写**。

### C9. Iceberg vs Hudi vs Paimon?

**要点**:Iceberg 通用 / Hudi upsert 强 / Paimon 流式强。

**追问**:怎么选?
**参考答案**:Iceberg 是 Apache 顶级项目,Spark/Flink/Trino/Presto 全引擎支持,适合通用数据湖。Hudi 强在 upsert(MOR/COW)+ CDC 集成,适合频繁更新场景。Paimon(Flink Table Store)原生流批一体,适合 Flink 生态深度用户。生产推荐 **Iceberg 为主 + Paimon 流处理**。

### C10. Iceberg 的 Catalog?

**要点**:REST Catalog / Hive Catalog / Glue Catalog / Nessie / Snowflake / DynamoDB。

**追问**:Catalog 在哪存元数据?
**参考答案**:Iceberg Catalog 是元数据入口,生产推荐 **REST Catalog**(标准 Iceberg REST 协议)或 **Hive Catalog**(复用 HMS)。REST Catalog 支持 Polaris(开源)/ Unity Catalog(商业)/ Gravitino(国产),适合多引擎。Hive Catalog 兼容老 HDFS 生态。

---

## 模块 D:YARN / K8s(10 题)

### D1. YARN 架构(ResourceManager / NodeManager / ApplicationMaster)?

**要点**:RM 全局调度;NM 节点代理;AM 单 Job 协调。

**追问**:YARN 调度器对比?
**参考答案**:RM 接收 Job 请求,分配 Container;NM 监控资源;AM 与 RM 协商资源,与 NM 启 Container。调度器:Capacity Scheduler(队列 + 容量保证)+ Fair Scheduler(公平分配)。生产几乎全用 Capacity,多业务线队列隔离。

### D2. YARN 的 Container 资源?

**要点**:`yarn.nodemanager.resource.memory-mb` + `yarn.nodemanager.resource.cpu-vcores`。

**追问**:Container 超内存会怎样?
**参考答案**:Container 资源由 NM 管理,内存超限触发 `OOMKilled`,CPU 超限被节流。生产配 `yarn.nodemanager.resource.detect-hardware-capabilities=true` 自动检测 + `yarn.nodemanager.resource.memory-mb=80% × 物理内存`。

### D3. K8s 的架构(Master / Node / Pod)?

**要点**:Master(API Server + Scheduler + Controller)+ Node(Kubelet + Kube-proxy + Container Runtime)+ Pod。

**追问**:Pod 调度流程?
**参考答案**:Pod 是最小调度单位,封装 Container + Volume + Config。调度流程:① API Server 接收 Pod spec;② Scheduler 按 affinity / taints / resources 选 Node;③ Kubelet 启动 Container;④ Kube-proxy 注册网络。生产配 PodDisruptionBudget + 反亲和避免单点。

### D4. K8s Operator 原理?

**要点**:CRD + Controller + Reconciliation Loop;监听资源变化 → 调谐实际状态。

**追问**:Spark Operator 怎么用?
**参考答案**:Operator 是 K8s 的扩展机制,自定义资源(CRD)+ Controller 监听,实现自动化运维。Spark Operator 定义 `SparkApplication` CRD,Controller 创建 Driver Pod → Driver Pod 创建 Executor Pod。生产推荐用 Operator 替代裸 YAML。

### D5. K8s 的网络(CNI / Service / Ingress)?

**要点**:CNI(Flannel / Calico / Cilium)负责 Pod 网络;Service 负载均衡;Ingress 外部入口。

**追问**:Calico vs Flannel?
**参考答案**:Flannel 简单 VXLAN overlay,适合小集群;Calico 支持 NetworkPolicy + BGP,生产首选;Cilium 是 eBPF 内核,高性能。生产推荐 **Calico + Nginx Ingress + ClusterIP**。

### D6. K8s 的存储(PVC / StorageClass / CSI)?

**要点**:PV 持久卷 + PVC 申请 + StorageClass 动态分配 + CSI 驱动。

**追问**:动态供给怎么配?
**参考答案**:K8s 存储:PV 是集群资源,PVC 是命名空间申请。StorageClass 描述 provisioner(如 AWS EBS / JuiceFS CSI),PVC 引用 StorageClass 自动创建 PV。生产推荐 **CSI 驱动 + StorageClass**,无需手动创建 PV。

### D7. K8s 的调度(affinity / taints / tolerations)?

**要点**:NodeAffinity(节点选择)+ PodAffinity(同节点)+ Taints + Tolerations(节点排斥)。

**追问**:怎么把 GPU 任务调度到特定节点?
**参考答案**:`nodeSelector` 简单键值对;`NodeAffinity` 支持运算符(In / NotIn / Exists);Taints 给节点打"染色",Pod 必须 Tolerations 才能调度。生产 GPU 任务:`nodeSelector: nvidia.com/gpu.product=NVIDIA-H100-80GB-HBM3` + Taints 防止其他 Pod 抢占。

### D8. K8s HPA / VPA / Karpenter?

**要点**:HPA 水平扩缩 Pod;VPA 垂直扩缩资源;Karpenter 节点级弹性。

**追问**:VPA 为什么不适合长任务?
**参考答案**:HPA 根据 CPU / Memory / 自定义指标扩缩 Pod 副本数。VPA 根据历史使用调整 request/limit,**会重启 Pod**(不保留内存),适合无状态服务。生产推荐 HPA + Karpenter,HPA 扩 Pod,Karpenter 扩 Node。

### D9. K8s 的可观测(Prometheus / Grafana / Loki)?

**要点**:Prometheus 指标 + Grafana 面板 + Loki 日志 + Jaeger / Tempo 链路。

**追问**:生产用啥?
**参考答案**:CNCF 事实标准。生产部署 kube-prometheus-stack(Operator 自动部署) + Grafana Loki + Tempo。Fluent Bit / Vector 收集日志 → Loki。生产告警用 Alertmanager → PagerDuty / 飞书。

### D10. K8s 上的大数据作业(Spark Operator / Flink Operator / Volcano)?

**要点**:Spark Operator + Flink Operator + Volcano(K8s 原生调度,支持 Gang)。

**追问**:为什么需要 Volcano?
**参考答案**:K8s 默认调度器逐个调度,分布式训练(8 卡 GPU)需要 gang scheduling(全部 Pod 同时就绪)。Volcano / Kueue 提供 Gang Scheduling。生产大数据 on K8s 必备 Volcano / Kueue。

---

## 模块 E:Kafka(10 题)

### E1. Kafka 的架构(Broker / Topic / Partition / Replica)?

**要点**:Broker 服务节点;Topic 逻辑队列;Partition 物理分片;Replica 多副本。

**追问**:为什么需要 Partition?
**参考答案**:Broker 是 Kafka 服务进程;Topic 是消息分类;Partition 是物理分片,**并行读写**;Replica 是副本(Leader + Follower)。Partition 是 Kafka 扩展性核心:① 增加并行度;② 多副本高可用;③ 顺序保证单 partition 内。

### E2. Kafka 的 ISR(In-Sync Replicas)?

**要点**:Leader + 同步副本集合;`min.insync.replicas` 决定写入最小副本数。

**追问**:ISR 收缩怎么恢复?
**参考答案**:Follower 落后 Leader `replica.lag.time.max.ms`(默认 30s)被踢出 ISR。恢复:Follower 追上 LEO(日志末端偏移)+ `replica.lag.max.messages`(默认 4000)。生产关键 Topic 配 `min.insync.replicas=2` + `acks=all`,ISR 收缩触发告警。

### E3. Kafka 的写入流程?

**要点**:Producer → RecordAccumulator → Sender → Broker → PageCache → Disk。

**追问**:为什么用 PageCache?
**参考答案**:Kafka 写入不直接 fsync,先写 PageCache(OS 内存)+ 异步刷盘。读直接从 PageCache 返回,命中率高。生产配 `log.flush.interval.messages=10000`(批刷盘)+ `log.flush.interval.ms=1000`,平衡性能与持久性。

### E4. Kafka 的零拷贝(Zero Copy)?

**要点**:`sendfile()` 系统调用,数据从 PageCache → Socket Buffer,避免用户态拷贝。

**追问**:为什么比传统 IO 快?
**参考答案**:传统 IO:Disk → PageCache → 用户 Buffer → Socket Buffer → NIC,4 次拷贝 + 4 次上下文切换。零拷贝:Disk → PageCache → NIC,**2 次拷贝 + 2 次上下文切换**。Kafka `log.segment.bytes=1GB` + `sendfile()` 让消费读速度达 GB/s。

### E5. Kafka 的 Consumer Group?

**要点**:Group ID + 一个 Partition 只能被 Group 内一个 Consumer 消费。

**追问**:Consumer Rebalance 怎么避免?
**参考答案**:Consumer Group 实现"消息广播 + 负载均衡"。Rebalance 触发条件:Consumer 加入 / 离开 / 心跳超时。避免:① 调长 `session.timeout.ms`(默认 10s → 30s);② `max.poll.interval.ms` 调长;③ 静态分配(`assign()` 而不是 `subscribe()`)。

### E6. Kafka 的 offset 管理?

**要点**:`__consumer_offsets` topic 存 group offset;`auto.offset.reset` + `enable.auto.commit`。

**追问**:Exactly-Once 怎么保证?
**参考答案**:Kafka 0.9+ offset 存在 `__consumer_offsets` topic,Consumer Group 提交。Exactly-Once:① 手动提交 + 幂等处理;② Kafka 事务 + 读已提交(`isolation.level=read_committed`);③ Flink / Spark 用 checkpoint + 提交 offset。

### E7. Kafka 的存储结构(Log Segment / Index)?

**要点**:Partition 切 Log Segment(默认 1GB);`.log` + `.index` + `.timeindex`。

**追问**:Kafka 怎么快速定位消息?
**参考答案**:每个 Partition 是顺序写 Log,切分为 Segment(`log.segment.bytes=1GB`)。`.index` 稀疏索引(offset → position),`.timeindex` 时间 → offset。查询用二分查找 + 顺序扫描,O(log N + offset 距离)。

### E8. Kafka 的事务?

**要点**:Producer 事务 + Consumer 读已提交;`transactional.id` 唯一 + `transaction.state.log.replication.factor=3`。

**追问**:为什么需要 transactional.id?
**参考答案**:Kafka 0.11+ 支持事务(幂等 + 原子),`enable.idempotence=true` 保证不重不丢。`transactional.id` 用于 producer 会话恢复。生产配 `transactional.id` + `acks=all` + `isolation.level=read_committed`。

### E9. Kafka 的副本同步?

**要点**:Leader 处理读写 + Follower 拉取同步;High Watermark + Log End Offset。

**追问**:Follower 落后太多怎么办?
**参考答案**:Follower 通过 `replica.fetch.min.bytes=1` 拉取,LEO(Log End Offset)记录写到哪里。Leader HW(High Watermark)是所有 ISR 中最小的 LEO,消费者只读到 HW。Follower 落后太多被踢 ISR,可通过 `kafka-reassign-partitions.sh` 重分配。

### E10. Kafka 的调优参数?

**要点**:Broker(server.properties)+ Producer + Consumer + Topic 配置。

**追问**:生产如何调优?
**参考答案**:`num.network.threads=8` + `num.io.threads=16`(Broker IO/网络线程);Producer `linger.ms=10` + `compression.type=zstd` + `batch.size=32KB`;Consumer `max.poll.records=500`。生产配 `auto.create.topics.enable=false`,Topic 必须预创建。

---

## 模块 F:SQL(10 题)

### F1. SQL 执行计划怎么看?

**要点**:从上到下从右到左;Operator 看数据源 / Join / Aggregate。

**追问**:怎么看是否有性能问题?
**参考答案**:`EXPLAIN` 输出树形,叶子节点 = 数据源。性能关键点:① Table Scan(全表扫描);② Hash Join 大表;③ Sort(内存不足会外溢);④ Exchange(Shuffle)。生产排错:**先消灭 Table Scan + Shuffle**。

### F2. SQL 优化的一般步骤?

**要点**:先看执行计划;建索引 / 加分区 / 改写 SQL / 调参数。

**追问**:大数据场景怎么优化?
**参考答案**:① 看 EXPLAIN 找瓶颈;② 加分区 / 索引;③ 改写 SQL(避免 `SELECT *` + `IN` 用 JOIN + CTE 拆解);④ 调参数(`parallel_fragment_exec_instance_num`);⑤ 加缓存 / 物化视图。生产 OLAP 必须先**跑 EXPLAIN**。

### F3. Join 的几种算法?

**要点**:Nested Loop / Hash Join / Sort Merge Join;数据量决定。

**追问**:为什么大表不能 Nested Loop?
**参考答案**:Nested Loop O(M×N),两张大表性能爆炸。Hash Join O(M+N),适合至少一张小表(可放内存)。Sort Merge Join O(M log M + N log N),适合两张大表,但需先排序。生产 OLAP 几乎全用 Hash Join 或 Broadcast Join。

### F4. 窗口函数怎么用?

**要点**:`ROW_NUMBER() / RANK() / DENSE_RANK() / LAG() / LEAD() / SUM() OVER`。

**追问**:Top N 怎么写?
**参考答案**:窗口函数基于 OVER 子句定义窗口范围。Top N:`ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY gmv DESC) AS rn, WHERE rn <= 10`。LAG / LEAD 取前后行,适合计算同环比。

### F5. CTE 和子查询的区别?

**要点**:CTE = WITH 子句,可读性好;子查询可内联,性能可能更好。

**追问**:Spark / Flink CTE 优化?
**参考答案**:CTE(Common Table Expression)用 WITH 子句定义临时结果集,提升可读性。Spark / Flink SQL 优化器可能把 CTE 内联,也可能物化。生产上**复杂查询推荐 CTE**,调试 / 维护 / 阅读都更好。

### F6. 索引的原理和分类?

**要点**:B-Tree / Hash / Bitmap / 倒排;OLTP 用 B-Tree,OLAP 用 Bitmap / 倒排。

**追问**:Doris / StarRocks 索引?
**参考答案**:B-Tree 适合范围查询 + 排序;Hash 适合等值;Bitmap 适合枚举列;倒排适合文本搜索。Doris / StarRocks 用前缀索引 + ZoneMap + Bitmap 索引,自动应用。生产上**OLAP 不需要手建索引**,自动维护。

### F7. 谓词下推(Filter Pushdown)?

**要点**:把 WHERE 条件推到数据源,减少读取行数;Parquet / ORC 列存受益。

**追问**:为什么 Iceberg 慢读?
**参考答案**:Iceberg / Parquet 谓词下推:① 行组统计(Row Group Stats,min/max);② Page Statistics(Parquet Page 级别);③ Bloom Filter。生产上必须配 Sort Order,**让 Row Group min/max 有效**。

### F8. 数据倾斜的 SQL 表现?

**要点**:某个 Task / Worker 处理时间远超其他;Key 分布不均。

**追问**:定位方法?
**参考答案**:`SELECT key, COUNT(*) FROM t GROUP BY key ORDER BY COUNT(*) DESC LIMIT 10` 找热 key。Spark / Flink UI 看 Task Duration 分布。解决:盐值 / 单独处理 / 两阶段聚合。生产 SQL 必须先**查 key 分布**。

### F9. 物化视图(Materialized View)?

**要点**:预计算查询结果,定期刷新;ClickHouse / Doris / StarRocks 原生支持。

**追问**:和缓存的区别?
**参考答案**:物化视图是数据库对象,SQL 查询自动重写。缓存(Materialized Cache)是查询结果缓存,过期失效。生产推荐 OLAP 数据库都用物化视图,BI 报表提速 10–100×。

### F10. SQL 执行参数调优?

**要点**:`parallel_fragment_exec_instance_num`(并发)+ `mem_limit`(单查询内存)+ `batch_size`。

**追问**:Doris 怎么调?
**参考答案**:Doris `parallel_fragment_exec_instance_num = CPU / 2`,`mem_limit = 32GB` 防 OOM。Spark `spark.sql.adaptive.skewJoin.*` + `spark.sql.adaptive.coalescePartitions.enabled`。Flink `taskmanager.memory.managed.fraction=0.4`。生产上**所有引擎都有默认参数**,但生产必须根据 workload 调整。

---

## 模块 G:数仓建模(10 题)

### G1. 维度建模的三大要素?

**要点**:事实表(Fact)+ 维度表(Dimension)+ 粒度(Granularity)。

**追问**:事实表怎么分类?
**参考答案**:事实表存度量数据(数值,可加和)。分类:① 事务事实(每笔交易一行);② 周期快照(每天一行);③ 累积快照(订单生命周期)。维度表存业务实体(用户、商品、时间)。Kimball 维度建模是事实 + 维度 + 粒度三件套。

### G2. 数仓分层(ODS / DWD / DWS / ADS)?

**要点**:ODS(原始数据)+ DWD(明细)+ DWS(汇总)+ ADS(应用)。

**追问**:为什么需要分层?
**参考答案**:① 屏蔽原始数据变化(Schema 演进);② 复用聚合(避免重复计算);③ 权限隔离(ODS 严格 + ADS 开放);④ 数据治理(每层质量 SLA)。生产推荐 **5 层**:ODS → DWD → DWS → DIM → ADS。

### G3. 缓慢变化维(SCD)?

**要点**:SCD Type 1(覆盖)+ Type 2(新增行,带版本)+ Type 3(新增列,带历史值)。

**追问**:Type 2 怎么实现?
**参考答案**:维度属性变化追踪历史。Type 2 新增行(原行保留)+ `effective_date` / `end_date` / `is_current`。生产实现:`MERGE INTO` 或 Iceberg `upsert` + 时间戳过滤。Type 2 是数仓最常用 SCD。

### G4. 指标体系(原子指标 / 派生指标 / 复合指标)?

**要点**:原子指标(不可拆)+ 派生指标(原子 + 修饰)+ 复合指标(派生组合)。

**追问**:怎么建设指标平台?
**参考答案**:指标平台是指标定义 / 计算 / 服务一体化系统。建设:① 指标字典(原子 + 派生定义);② 计算引擎(OneService + Flink / Spark);③ 指标服务(gRPC / HTTP)。生产推荐 **DataWork / 阿里云指标平台**。

### G5. 一致性维度(Conformed Dimension)?

**要点**:跨业务共享的维度(用户 / 商品 / 时间)。

**追问**:怎么保证一致性?
**参考答案**:跨多个事实表的统一维度,保证口径一致。建设:① 全局 DIM 表;② 数据血缘追踪;③ 指标命名规范。生产推荐 **OneService 维度服务** + 自动化血缘。

### G6. Data Vault 模型?

**要点**:Hub(业务键)+ Link(关系)+ Satellite(属性);适合企业级数据建模。

**追问**:Data Vault vs Kimball?
**参考答案**:Data Vault 是更现代的建模方法,分 Hub(唯一业务键)+ Link(关系)+ Satellite(属性)。优点:① 高度灵活;② 易于扩展;③ 适合企业级。缺点:复杂、查询性能差。生产上 **Kimball + Data Vault 混用**:核心交易用 Kimball,主数据用 Data Vault。

### G7. 数据血缘?

**要点**:从源头到消费的全链路追踪;Atlas / DataHub / Gravitino。

**追问**:血缘怎么采集?
**参考答案**:通过解析 SQL(Parse + Analyze)+ 解析 ETL 作业(Airflow / DolphinScheduler)生成 DAG。生产推荐 **Apache Gravitino / DataHub**(开源)+ 阿里云 DataWorks(商业)。

### G8. 数据质量(SLA / 准确率 / 完整性 / 及时性)?

**要点**:5 个维度 + 监控告警 + 数据校验。

**追问**:怎么落地?
**参考答案**:5 个维度:① 准确性(值正确);② 完整性(无丢失);③ 一致性(跨源一致);④ 及时性(SLA);⑤ 唯一性(无重复)。落地:① 数据校验(Great Expectations / DBT);② 监控告警(Grafana);③ 异常处理(自动修复 / 人工介入)。

### G9. 数据治理(GOVERNANCE)?

**要点**:元数据 + 血缘 + 质量 + 安全 + 成本 + 资产化。

**追问**:治理和组织的关系?
**参考答案**:数据治理是组织行为,不是技术问题。需要:① CDO(首席数据官);② 数据 Owner(每业务线);③ 数据委员会(月度 review);④ 工具平台(Gravitino / DataHub / 阿里云治理)。**组织 + 流程 + 工具**缺一不可。

### G10. 实时数仓分层?

**要点**:ODS(实时采集)+ DIM(实时维表)+ DWD(实时明细)+ DWS(实时汇总)+ ADS(应用)。

**追问**:实时数仓 vs 离线数仓差异?
**参考答案**:实时数仓分层同离线,但存储用 Kafka / Iceberg 流式表。关键技术:① Flink CDC 整库同步;② Flink SQL 流批一体;③ Iceberg / Hudi 流式 Upsert;④ Doris 实时物化视图。生产推荐 **Iceberg + Flink CDC + Doris** 实时数仓。

---

## 模块 H:综合(LLM / Vector / Cost / 架构)(10 题)

### H1. LLM Data Engineer 和传统数仓工程师区别?

**要点**:数据形态(非结构化)+ 去重(语义)+ 评估(Benchmark)+ 规模(PB)+ 流式消费。

**追问**:LLM 数据去重为什么难?
**参考答案**:LLM 训练数据是文本 / 图片 / 视频非结构化,体量 PB 级。去重方法:① 精确去重(MD5);② 近似去重(MinHash LSH / SimHash);③ 语义去重(Embedding 相似度)。生产推荐 **MinHash + Embedding 双层去重**,阈值 0.8。

### H2. 向量数据库的 ANN 算法?

**要点**:IVF(倒排)+ HNSW(导航小世界图)+ PQ(乘积量化)+ ScaNN(Google SoTA)。

**追问**:HNSW 为什么比 IVF 快?
**参考答案**:IVF 桶内暴力 O(n/nlist × d),HNSW 图遍历 O(log N × d)。HNSW 内存大但 Recall 高。生产根据规模选:**亿级用 IVF-PQ**(内存省),千万级用 HNSW(Recall 高),极致性能用 ScaNN。

### H3. RAG 系统怎么评测?

**要点**:RAGAS 4 项(context_precision / context_recall / faithfulness / answer_relevancy)+ 人工评测。

**追问**:评测不达标怎么办?
**参考答案**:RAGAS 自动评测 + 人工评测 200 条。指标不达标的优化:① Retrieval 差→加 Rerank + 改 Embedding 模型;② Generation 差→改 Prompt + 加 Few-shot;③ Faithfulness 差→加 Citation。生产必须**每次 prompt 改动跑评测**。

### H4. Prompt 数据治理的 5 个维度?

**要点**:质量(相关性 / 事实性)+ 安全(有害 / PII)+ 成本(token 单价)+ 性能(TTFT / TPOT)+ 合规(GDPR)。

**追问**:PII 怎么脱敏?
**参考答案**:质量评估:LLaMA-as-Judge + 人工评测。安全:OpenAI Moderation + 红队测试 + 关键词过滤。性能:Langfuse 监控 TTFT / TPOT。合规:30 天数据保留 + 删除接口。**Prompt 也是数据资产**,必须治理。

### H5. vLLM 的 PagedAttention 原理?

**要点**:KV cache 分页管理,借鉴 OS 虚拟内存;解决显存碎片 + 提升并发。

**追问**:为什么比 HF Transformers 快?
**参考答案**:KV cache 是 Transformer 推理最大显存消耗(每 Token 数 KB)。PagedAttention 把 KV cache 切成固定大小块(类似 OS 页),按需分配 + LRU 换出,提升 GPU 利用率。**Continuous batching** 让多个请求共享 GPU,吞吐 10–20×。

### H6. 成本治理的 4R 模型?

**要点**:Right-sizing / Right-timing / Right-pricing / Right-architecture。

**追问**:具体怎么落地?
**参考答案**:**Right-sizing**:资源按需分配(HPA / Karpenter);**Right-timing**:按时段弹性(凌晨缩 0 + Cron);**Right-pricing**:价格最优(Spot / Savings Plans);**Right-architecture**:架构合理(存算分离 / 冷热分层 / Serverless)。

### H7. 存算分离的工程坑?

**要点**:远程 Shuffle 慢 / 元数据压力大 / 小文件 IO 放大 / 一致性弱。

**追问**:怎么解决?
**参考答案**:① Apache Celeborn / Remote Shuffle;② Redis / TiKV 元数据;③ 攒批写;④ Iceberg ACID + Checkpoint。生产推荐 **JuiceFS + Celeborn + Iceberg** 一站式存算分离。

### H8. 湖仓一体 vs 数据湖 vs 数仓?

**要点**:数据湖(原始数据)+ 数仓(高度结构化)+ 湖仓一体(融合,ACID + 性能)。

**追问**:为什么湖仓一体是趋势?
**参考答案**:数据湖(S3 + Parquet)灵活但无 ACID,数仓(Teradata / Snowflake)性能好但成本高。湖仓一体(Iceberg + Trino / Doris / Spark)融合两者优点:**开放 + 事务 + 高性能 + 成本低**。生产推荐 Iceberg + Doris + Spark/Flink。

### H9. 大数据 + LLM 的未来方向?

**要点**:AI Agent 数据工程 / RAG + Text-to-SQL / 向量数据库入湖 / GPU 调度 / 成本治理。

**追问**:工程师怎么准备?
**参考答案**:① AI Agent 自动 ETL;② RAG + Text-to-SQL 业务自助分析;③ 向量数据入湖(可观测 + 可治理);④ GPU 调度优化推理成本;⑤ FinOps + AI 推理成本(LLM token 单价)。工程师需学 **Prompt 治理 + 向量库 + GPU 调度**。

### H10. 50K 工程师的核心竞争力?

**要点**:技术深度(源码)+ 架构能力(湖仓 + 治理)+ 业务 Sense + 跨团队协作。

**追问**:怎么培养?
**参考答案**:**技术深度**:能定位问题到源码行;**架构能力**:独立设计 PB 级平台;**业务 Sense**:能从数据看到业务;**跨团队协作**:推动 4 团队落地;**影响力**:Tech Blog + 内部分享 + 开源贡献。生产上必须**选一个垂直行业**(金融 / 电商 / 物流)做深,差异化竞争。

---

## 题库统计

| 模块 | 题数 |
| --- | --- |
| Spark | 25 |
| Flink | 25 |
| Iceberg | 10 |
| YARN / K8s | 10 |
| Kafka | 10 |
| SQL | 10 |
| 数仓建模 | 10 |
| 综合(LLM/Vector/Cost) | 10 |
| **合计** | **110** |

---

## 实战任务

1. **每天口答 5 题**,录音回放纠正。
2. **每周模拟面试 1 次**,找朋友或付费教练。
3. **遇到不会的题,翻底层原理,写笔记**。
4. **建立错题本**:答错 + 答漏的题记录。
5. **每模块刷完做总结脑图**。

---

## 生产经验

1. **面试 80% 的题在题库内**,但表达要 STAR + 量化。
2. **不会的题诚实说 + 怎么学**,不要硬编。
3. **每场面试录音回放**,记卡顿点。
4. **面经沉淀比刷题重要**,要写笔记。
5. **考官在意思考过程,不在标准答案**。

---

**下一章** → [07-学习资源与书单](./07-resources.md)