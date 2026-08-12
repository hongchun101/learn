# 03. Spark 核心原理:RDD / DAG / 调度

> **本章定位**:把 Spark 的三层调度(DAGScheduler / TaskScheduler / SchedulerBackend)、RDD 五要素、Stage 切分、Shuffle(Hash/Sort/Tungsten Sort)、BlockManager 讲透。理解这些,生产调优 80% 的问题都能定位到源码。

---

## 1. Spark 三层调度架构

```
 ┌─────────────────────────────────────────────────────────────┐
 │  SparkContext  (Driver 端,SparkSession 入口)                │
 │   ├─ DAGScheduler   把 RDD DAG 切成 Stage                    │
 │   ├─ TaskScheduler  把 TaskSet 分配给 SchedulerBackend     │
 │   └─ SchedulerBackend 与外部集群通信(YARN/Mesos/Standalone) │
 └────────────────────────┬────────────────────────────────────┘
                          │ RPC: Task description + ResourceOffer
                          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  Cluster Manager  (YARN RM / Spark Standalone Master)        │
 └────────────────────────┬────────────────────────────────────┘
                          │ Container Launch
                          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  Executor  (JVM 进程,跑 Task,存 Block)                       │
 │   ├─ ExecutorBackend  与 Driver 心跳,反注册/注册 Task       │
 │   ├─ TaskRunner       一个线程跑一个 Task                    │
 │   └─ BlockManager     数据读写、Shuffle、广播、缓存           │
 └─────────────────────────────────────────────────────────────┘
```

关键源码类:
- `org.apache.spark.scheduler.DAGScheduler`
- `org.apache.spark.scheduler.TaskSchedulerImpl`
- `org.apache.spark.scheduler.cluster.YarnSchedulerBackend`(YARN 模式)
- `org.apache.spark.scheduler.cluster.CoarseGrainedSchedulerBackend`(Standalone)
- `org.apache.spark.executor.Executor`

---

## 2. RDD 五要素

源码:`org.apache.spark.rdd.RDD`,五个核心属性:

```scala
abstract class RDD[T: ClassTag](
    @transient private var _sc: SparkContext,
    @transient private var deps: Seq[Dependency[_]]
  ) extends Serializable with Logging {

  // 1. 分区列表
  protected def getPartitions: Array[Partition]

  // 2. 依赖列表(parent RDD)
  protected def getDependencies: Seq[Dependency[_]]

  // 3. compute 函数,每个分区计算逻辑
  def compute(split: Partition, context: TaskContext): Iterator[T]

  // 4. 分区器(可选,只有 KV RDD 才有)
  @transient val partitioner: Option[Partitioner] = None

  // 5. 优先位置(可选,数据本地性)
  protected def getPreferredLocations(split: Partition): Seq[String] = Nil
}
```

### 2.1 五大属性的运行时作用

| 属性 | 决定 | 例子 |
| --- | --- | --- |
| Partitions | Task 数 | `sc.textFile(...)` 分区数 = `min(block 数, sc.defaultParallelism=200)` |
| Dependencies | Stage 切分 | 宽依赖 = Stage 边界,窄依赖 = Stage 内 pipeline |
| compute | 计算逻辑 | `MapPartitionsRDD#compute` 跑用户函数 |
| Partitioner | 数据分布 | `HashPartitioner` / `RangePartitioner` |
| PreferredLocations | Task 调度本地性 | `HadoopRDD#getPreferredLocations` 从 block 位置推断 |

### 2.2 关键 RDD 实现

- `ParallelCollectionRDD` — `sc.parallelize(Seq(1,2,3))`。
- `HadoopRDD` — `sc.textFile(path)` 文本/CSV。
- `MapPartitionsRDD` — `rdd.map { ... }`。
- `ShuffledRDD` — `rdd.reduceByKey(...)` 后生成。
- `CoGroupedRDD` — `rdd.cogroup(...)`。
- `UnionRDD` — `rdd1.union(rdd2)`。

---

## 3. 依赖:窄依赖 vs 宽依赖

### 3.1 两种依赖

```scala
abstract class Dependency[T] {
  def rdd: RDD[T]
}

// 窄依赖:每个 parent partition 最多被一个 child partition 使用
case class OneToOneDependency[T](rdd: RDD[T]) extends NarrowDependency[T]
case class RangeDependency[T](rdd: RDD[T], inStart: Int, outStart: Int, length: Int) extends NarrowDependency[T]

// 宽依赖:parent partition 可能被多个 child partition 使用(ShuffleDependency)
case class ShuffleDependency[K, V, C](
    @transient rdd: RDD[_],
    val partitioner: Partitioner,
    @transient val serializer: Serializer = SparkEnv.get.serializer
  ) extends Dependency[Product2[K, V]]
```

### 3.2 图示

```
         ┌──────────────────┐
         │  textFile  (RDD 1)│   partition: 4
         └────────┬─────────┘
                  │ OneToOneDependency (窄)
         ┌────────▼─────────┐
         │  filter (RDD 2)  │   partition: 4
         └────────┬─────────┘
                  │ OneToOneDependency (窄)
         ┌────────▼─────────┐
         │  map (RDD 3)     │   partition: 4
         └────────┬─────────┘
                  │ ShuffleDependency (宽) ← STAGE 边界
         ┌────────▼─────────┐
         │ reduceByKey(RDD4)│   partition: 200 (默认 parallelism)
         └──────────────────┘

  Stage 0: textFile → filter → map      (一个 stage 内 pipeline)
  Stage 1: reduceByKey                  (shuffle 必须落盘)
```

**关键规则**:遇到宽依赖 = 切 Stage;窄依赖 = 同 Stage pipeline。

---

## 4. Stage 切分源码: DAGScheduler

源码位置:`org.apache.spark.scheduler.DAGScheduler#submitJob`

### 4.1 主流程

```scala
def submitJob[T, U](
    rdd: RDD[T],
    func: (TaskContext, Iterator[T]) => U,
    partitions: Seq[Int],
    callSite: CallSite,
    resultHandler: (Int, U) => Unit,
    properties: Properties
): JobWaiter[U] = {
  val waiter = new JobWaiter[U](this, partitions.size, resultHandler)
  eventProcessLoop.post(JobSubmitted(jobId, rdd, func, ...))  // 异步消息
  waiter
}

private def handleJobSubmitted(...) {
  val finalStage = createResultStage(rdd, func, partitions, ...)
  submitStage(finalStage)  // 递归提交 stage
}

private def submitStage(stage: Stage) {
  if (!waitingStages(stage) && !runningStages(stage) && !failedStages(stage)) {
    val missing = getMissingParentStages(stage).sortBy(_.id)
    if (missing.isEmpty) {
      submitMissingTasks(stage, jobId)  // ★ 真正调度
    } else {
      for (parent <- missing) submitStage(parent)
      waitingStages += stage
    }
  }
}
```

### 4.2 createResultStage 关键逻辑

```scala
private def createResultStage(rdd, func, partitions, ...) = {
  // 反向遍历 RDD 依赖链,找到所有 ShuffleDependency,每个 ShuffleDependency 切一个 stage
  val parents = getOrCreateParentStages(rdd, jobId)
  val id = nextStageId.getAndIncrement()
  new ResultStage(id, rdd, func, partitions, parents, jobId, callSite)
}

private def getOrCreateParentStages(rdd, jobId) = {
  getShuffleDependencies(rdd).map { shuffleDep =>
    getOrCreateShuffleMapStage(shuffleDep, jobId)
  }
}
```

### 4.3 submitMissingTasks 流程

```scala
private def submitMissingTasks(stage: Stage, jobId: Int) {
  // 1. 序列化 Task 二进制(闭包清理)
  val taskBinaryBytes = stage match {
    case s: ShuffleMapStage => shuffleSerializer.get.value.serialize(s.rdd)
    case s: ResultStage    => resultSerializer.get.value.serialize(s.rdd, s.func)
  }
  // 2. 为每个 partition 生成一个 Task
  val tasks: Seq[Task[_]] = stage.pendingPartitions.map { partitionId =>
    val task = stage match {
      case s: ShuffleMapStage =>
        new ShuffleMapTask(stage.id, stage.latestInfo.attemptNumber, partitionId,
                           taskBinaryBytes, s.partitioner.numPartitions, s.loc, ...)
      case s: ResultStage =>
        new ResultTask(stage.id, stage.latestInfo.attemptNumber, partitionId,
                       taskBinaryBytes, s.func, s.loc, ...)
    }
    task
  }
  // 3. 提交给 TaskScheduler
  taskScheduler.submitTasks(new TaskSet(tasks.toArray, stage.id, ...))
}
```

### 4.4 ShuffleMapStage vs ResultStage

| Stage 类型 | 作用 | 输出 |
| --- | --- | --- |
| ShuffleMapStage | 中间 stage,产生 Shuffle 数据 | MapStatus(数据位置) |
| ResultStage | 最后一个 stage,产出结果 | 计算结果,返回给 Driver |

---

## 5. TaskScheduler 与 SchedulerBackend

### 5.1 TaskSchedulerImpl 调度流程

源码:`org.apache.spark.scheduler.TaskSchedulerImpl#submitTasks`

```scala
override def submitTasks(taskSet: TaskSet) {
  val tasks = taskSet.tasks
  // 计算 task 本地性偏好
  val taskIdToTaskSetManager = TaskIdToTaskSetMap(taskSet.taskSetId)
  taskSetManager = new TaskSetManager(this, taskSet, maxTaskFailures)
  // 加入调度池
  scheduler.taskSetsByStageId.getOrElseUpdate(stageId, new mutable.HashMap) += (taskSet.stageId, taskSetManager)
  // 通知 backend 调整资源请求
  backend.reviveOffers()
}
```

### 5.2 resourceOffers 算法

源码:`TaskSchedulerImpl#resourceOffers`,核心循环:

```scala
for (offer in offers) {
  val taskSetManagers = ...   // 排序:FIFO / FAIR
  for (tsm <- taskSetManagers) {
    for (task <- tsm.resourceOffer(execId, host, maxLocality)) {
      launchedTask = true
      // 启动 task,backend 调 executor.launchTask()
    }
  }
}
```

### 5.3 本地性四级降级

源码:`TaskSetManager#resourceOffer`

```scala
def resourceOffer(execId: String, host: String, maxLocality: TaskLocality): TaskDescription = {
  val curLocality = ... // 计算当前最优 locality
  while (curLocality != maxLocality) {
    val tasks = pendingTasksForLocality(curLocality)
    if (tasks.nonEmpty) return launchTask(tasks.head, execId, host, curLocality)
    curLocality = nextLocalityLevel(curLocality)
  }
}
```

四级:`PROCESS_LOCAL → NODE_LOCAL → RACK_LOCAL → ANY`。

**关键参数**:`spark.locality.wait.process=10s`, `spark.locality.wait.node=3s`, `spark.locality.wait.rack=0s`。

### 5.4 SchedulerBackend 三种实现

| 类型 | 实现类 | 适用 |
| --- | --- | --- |
| Local | `LocalSchedulerBackend` | IDE 测试 |
| Standalone | `CoarseGrainedSchedulerBackend` | Spark 自带集群 |
| YARN | `YarnSchedulerBackend` | 生产 Hadoop 集群 |
| Mesos | `MesosFineGrainedSchedulerBackend` / `MesosCoarseGrainedSchedulerBackend` | 历史,被淘汰 |
| K8s | `KubernetesSchedulerBackend` | Spark 3.x on K8s |

### 5.5 CoarseGrainedSchedulerBackend 协议

Driver 端持有 `CoarseGrainedSchedulerBackend`,通过 Akka/Netty RPC 与 Executor 通信:

- `RegisterExecutor` — Executor 启动后向 Driver 注册。
- `LaunchTask` — Driver 把 Task 描述发给 Executor。
- `StatusUpdate` — Executor 报告 Task 完成 / 失败。

生产调整:`spark.rpc.message.maxSize=128m`(避免大型 task description 序列化失败)。

---

## 6. Shuffle 全景:Hash / Sort / Tungsten Sort

### 6.1 Hash Shuffle(已废弃)

源码:`org.apache.spark.shuffle.hash.HashShuffleWriter`(1.x 移除,2.x 后只保留 legacy)

```
Map 端:每个 map 为每个 reduce 生成一个文件
   Map0 → reduce0.bin, reduce1.bin, ..., reduce99.bin
   Map1 → reduce0.bin, reduce1.bin, ..., reduce99.bin
   ...
   → 总文件数 = M × R(M = map 数, R = reduce 数)
```

**问题**:1000 个 map + 1000 个 reduce = 100w 文件,文件系统崩溃。

### 6.2 Sort Shuffle(默认)

源码:`org.apache.spark.shuffle.sort.SortShuffleWriter#write`

```
Map 端:
   1. 用 PartitionedAppendOnlyMap(类似 HashMap)聚合(K, V)
   2. 达到阈值(spark.shuffle.spill.numElementsForceSpillThreshold=2000000)溢写
   3. 排序(partition, key)
   4. 对每个 partition,序列化写盘
   5. 索引文件 index: <partition, fileOffset>
   输出:
      shuffle_0_0_0.data     (map0, stage0, attempt0)
      shuffle_0_0_0.index
```

**优点**:每个 map 只生成 1 个 data 文件 + 1 个 index 文件,文件数 = M × numReduceTasks(数据文件)。

**Bypass Merge Sort**(`spark.shuffle.sort.bypassMergeThreshold=200`,map 数 ≤ 200 时启用):

源码:`BypassMergeSortShuffleWriter#write`

```
   1. 不聚合,直接按 partition 写到临时文件
   2. 最后用 IOUtils.copy 把多个文件 merge 成一个
   3. 输出 1 个 data + 1 个 index
```

**适用**:map 数少,聚合逻辑简单(类似 MapReduce 的 combiner-less 模式)。

### 6.3 Tungsten Sort Shuffle(优化版)

源码:`org.apache.spark.shuffle.sort.ShuffleExternalSorter`(Spark 2.x+)

```
核心:
   1. 堆外内存(Tungsten Unsafe)直接放序列化字节
   2. spill 时用 radix sort,O(N) 不是 O(N log N)
   3. 支持 Shuffle 合并(Multiple Shuffle Blocks in One File)
   4. 自动 spill 数 = disk I/O 次数
```

启用条件:
- `spark.shuffle.manager=tungsten-sort`(2.x 以前,3.x 后默认)
- `spark.memory.useLegacyMode=false`
- `spark.unsafe.offHeap=true`(堆外)

**优势**:
- 比 Sort Shuffle 减少 50%+ GC。
- 大分区(>10 GB)也能跑。

### 6.4 Shuffle 三阶段对比

```
               HashShuffle        SortShuffle         Tungsten Sort
文件数(每 map)  R                  1                   1
聚合优化         ❌                 ✅                  ✅
排序             ❌                 ✅(快排)            ✅(radix)
内存使用         堆                堆                  堆外
GC 影响          严重              中等                 低
序列化           Java              Java                 Unsafe
生产推荐         ❌                ✅                   ✅
```

---

## 7. BlockManager:Spark 数据 I/O 中心

源码:`org.apache.spark.storage.BlockManager`

### 7.1 核心职责

```
   - 管理 RDD partition / Shuffle / Broadcast / Accumulator 数据块
   - 内存 / 磁盘 / 堆外 三级存储
   - 与远端 BlockManagerMaster / 其他 Executor 通信(fetch 远程 block)
```

### 7.2 内存存储层级

源码:`org.apache.spark.memory.MemoryStore`

```
       MemoryStore (堆内)
            │
            ▼ (满了)
       DiskStore (本地磁盘,/tmp/blockmgr-xxx/)
            │
            ▼ (网络拉)
       Remote Block (其他 Executor)
```

关键参数:
- `spark.memory.fraction=0.6` — JVM 堆中,Execution + Storage 共用比例。
- `spark.memory.storageFraction=0.5` — Storage 占 Unified Memory 中比例。
- `spark.diskStore.subDirectories=64` — 本地磁盘子目录数,减少单目录文件数。
- `spark.shuffle.compress=true` — shuffle 输出是否压缩(LZ4)。

### 7.3 BlockManagerMaster 通信

源码:`org.apache.spark.storage.BlockManagerMasterEndpoint`(Driver 端 Actor)

```
Executor 启动:
   ├─ BlockManagerMaster.registerBlockManager(blockManagerId, maxMem, ...)
   │
   ├─ Driver 维护 Map<BlockManagerId, BlockStatus>
   ├─ Task 需要远程 block 时,driver.executorEndpoint.sendSync(GetBlockStatus)
   ├─ Driver 返回 block 所在的 BlockManagerId
   ├─ Executor 通过 Netty BlockTransferService fetch 远程 block
   └─ fetch 完成后注册到本地 MemoryStore
```

### 7.4 块格式

```scala
case class BlockId(val name: String) {
  // RDD Block: rdd_<rddId>_<partitionId>
  // Shuffle Block: shuffle_<shuffleId>_<mapId>_<reduceId>
  // Broadcast Block: broadcast_<id>
  // TaskResult Block: taskresult_<id>
}
```

---

## 8. Cache / Persist / Checkpoint

### 8.1 缓存级别

```scala
class StorageLevel private(
    private var _useDisk: Boolean,
    private var _useMemory: Boolean,
    private var _useOffHeap: Boolean,
    private var _deserialized: Boolean,
    private var _replication: Int = 1
)
```

| 级别 | 磁盘 | 内存 | 堆外 | 反序列化 | 副本 |
| --- | --- | --- | --- | --- | --- |
| MEMORY_ONLY | ❌ | ✅ | ❌ | ✅ | 1 |
| MEMORY_AND_DISK | ✅ | ✅ | ❌ | ✅ | 1 |
| MEMORY_ONLY_SER | ❌ | ✅ | ❌ | ❌(序列化) | 1 |
| MEMORY_AND_DISK_SER | ✅ | ✅ | ❌ | ❌ | 1 |
| DISK_ONLY | ✅ | ❌ | ❌ | ❌ | 1 |
| OFF_HEAP | ❌ | ❌ | ✅ | ❌ | 1 |

### 8.2 persist vs checkpoint

- **persist**:数据放在 BlockManager,生命周期 = Application,Driver 退出就丢。
- **checkpoint**:数据写到 HDFS,跨 Application 保留。源码:`RDD#checkpoint`,触发 `RDDCheckpointData#doCheckpoint`。
- **persist+checkpoint**:`spark.checkpoint.dir=hdfs:///ckpt`,先 cache 再 checkpoint,避免重算。

```scala
sc.setCheckpointDir("hdfs:///checkpoints")
val rdd = sc.textFile("hdfs:///data").cache()
rdd.checkpoint()  // 第一次 action 触发
```

### 8.3 生产经验

- `MEMORY_AND_DISK_SER` 比 `MEMORY_ONLY` 更稳:内存不够自动落盘,序列化减少内存占用 2~5x。
- 大表尽量 `MEMORY_ONLY_SER` + Kryo 序列化(`spark.serializer=org.apache.spark.serializer.KryoSerializer`)。
- `OFF_HEAP` 适合 100 GB+ 大缓存,需开 `spark.unsafe.offHeap=true`。

---

## 9. 生产参数清单(Spark Core)

`spark-defaults.conf`:

```properties
# 内存模型
spark.memory.fraction=0.6
spark.memory.storageFraction=0.5
spark.memory.useLegacyMode=false
spark.unsafe.offHeap=true
spark.unsafe.sorter.spill.reader.buffer.size=1m

# Shuffle
spark.shuffle.manager=sort
spark.shuffle.sort.bypassMergeThreshold=200
spark.shuffle.spill.numElementsForceSpillThreshold=2000000
spark.shuffle.compress=true
spark.shuffle.file.buffer=64k

# 本地性
spark.locality.wait.process=10s
spark.locality.wait.node=3s
spark.locality.wait.rack=0s

# 网络
spark.rpc.message.maxSize=128
spark.network.timeout=120s
spark.shuffle.io.maxRetries=3
spark.shuffle.io.retryWait=5s

# 序列化
spark.serializer=org.apache.spark.serializer.KryoSerializer
spark.kryo.registrationRequired=false
spark.kryo.registrator=com.bigdata.MyKryoRegistrator

# 推测执行
spark.speculation=true
spark.speculation.multiplier=1.5
spark.speculation.quantile=0.75

# 失败重试
spark.task.maxFailures=4
spark.stage.maxConsecutiveAttempts=4

# 动态分配
spark.dynamicAllocation.enabled=true
spark.dynamicAllocation.minExecutors=2
spark.dynamicAllocation.maxExecutors=100
spark.shuffle.service.enabled=true
```

---

## 10. 生产实战任务

### 10.1 任务一:RDD 分区 + 自定义 Partitioner

```scala
// code/spark/wordcount-partitioner.scala
class TimePartitioner(numParts: Int) extends Partitioner {
  override def numPartitions: Int = numParts
  override def getPartition(key: Any): Int = {
    val ts = key.asInstanceOf[Long]
    ((ts / 3600) % 24).toInt % numParts
  }
}

val rdd = sc.textFile("hdfs:///data/events")
val pairs = rdd.map { line =>
  val parts = line.split(",")
  (parts(0).toLong, parts(1))  // (eventTime, payload)
}
val partitioned = pairs.partitionBy(new TimePartitioner(200))
val result = partitioned.reduceByKey(_ + _)
result.saveAsTextFile("hdfs:///data/output")
```

### 10.2 任务二:Spark Submit 完整配置

```bash
spark-submit \
  --master yarn \
  --deploy-mode cluster \
  --name "TPC-DS-Q1" \
  --queue prod \
  --num-executors 50 \
  --executor-memory 16g \
  --executor-cores 4 \
  --driver-memory 8g \
  --conf spark.memory.fraction=0.7 \
  --conf spark.memory.storageFraction=0.3 \
  --conf spark.shuffle.service.enabled=true \
  --conf spark.dynamicAllocation.enabled=true \
  --conf spark.sql.adaptive.enabled=true \
  --conf spark.serializer=org.apache.spark.serializer.KryoSerializer \
  --conf spark.task.maxFailures=4 \
  --jars /opt/jars/mysql-connector.jar,/opt/jars/iceberg-spark.jar \
  --class com.bigdata.tutorial.TPCDSQuery \
  hdfs:///apps/tpcds-1.0-SNAPSHOT.jar \
  --dsdgenConf /opt/conf/dsdgen.conf
```

### 10.3 任务三:Stage 划分观察

```scala
// 在 spark-submit 加 --conf spark.sql.explain=true
// 或在 Spark Shell 中:
spark.sql("EXPLAIN EXTENDED SELECT a.id, SUM(b.amt) FROM a JOIN b ON a.id = b.id").show(false)
```

观察输出:
- `== Physical Plan ==` 段落。
- `Exchange` 节点 = ShuffleDependency,Stage 边界。
- `Sort` + `SortMergeJoin` 标志 Sort Merge Join。

### 10.4 任务四:BlockManager 监控

```scala
// Spark UI: http://driver:4040
// - Storage tab:看每个 RDD 的内存占用 + 缓存命中率
// - Executors tab:看每个 Executor 的 Shuffle Spill (Disk/Memory)
// - "Shuffle Spill (Memory)" 高 → 内存不够 → 调 spark.memory.fraction 或 Reduce Spill
// - "Shuffle Spill (Disk)" 高 → 调 spark.shuffle.spill.numElementsForceSpillThreshold 加大
```

### 10.5 任务五:Stage 重试 + 推测执行

```scala
val conf = new SparkConf()
  .set("spark.speculation", "true")
  .set("spark.speculation.multiplier", "1.5")  // 比中位数慢 1.5 倍才推测
  .set("spark.speculation.quantile", "0.75")   // 75% 的 task 已经完成才比较
val sc = new SparkContext(conf)
```

---

## 11. 专家面试题

1. **Spark 的 DAGScheduler 是怎么切 Stage 的?**
   *要点*:从最后一个 RDD 反向遍历,遇到 `ShuffleDependency` 就切一个 Stage;窄依赖串到同一个 Stage。源码 `DAGScheduler#getShuffleDependencies`。
2. **窄依赖为什么可以 pipeline?**
   *要点*:每个 parent partition 只被一个 child partition 使用,无需 shuffle 拉数据,直接 Iterator 串联。`OneToOneDependency` / `RangeDependency`。
3. **ShuffleMapStage 和 ResultStage 的区别?**
   *要点*:ShuffleMapStage 中间产物 = `MapStatus`(记录 block 位置);ResultStage 最终产物 = 算子结果。源码 `DAGScheduler#submitMissingTasks`。
4. **Spark 3.x 默认 Shuffle 是哪种?**
   *要点*:SortShuffleManager,内部根据 map 数自动选 `SortShuffleWriter` / `BypassMergeSortShuffleWriter` / `UnsafeShuffleWriter`(Tungsten)。
5. **Tungsten Sort 比普通 Sort Shuffle 强在哪?**
   *要点*:堆外内存 + radix sort + 序列化字节直接操作,减少 GC;`ShuffleExternalSorter` 源码。
6. **BlockManager 怎么找到远程 block?**
   *要点*:Driver 端 `BlockManagerMaster` 维护全局 block → executor 映射,Executor 通过 `NettyBlockTransferService` fetch。
7. **persist 和 checkpoint 区别?**
   *要点*:persist 数据在 Executor 内存/磁盘,Driver 退出后丢失;checkpoint 写到 HDFS,跨 Application 保留。生产上 `cache + checkpoint` 组合用。
8. **本地性等待超时后会怎样?**
   *要点*:TaskSetManager 降一级 Locality 重试。`spark.locality.wait.process=10s,node=3s,rack=0s,any=0s`,超时后任意节点可执行。
9. **Spark on YARN 的 ApplicationMaster 包含哪些角色?**
   *要点*:Spark Driver + ApplicationMaster + SchedulerBackend 三合一。`ApplicationMaster` 启动 Spark Driver,然后 Driver 通过 `YarnSchedulerBackend` 与 RM 通信。
10. **Task 失败几次会被 kill?**
    *要点*:`spark.task.maxFailures=4`,连续失败 4 次后整个 Stage 失败。Speculative 任务重置计数。
11. **Speculative Execution 是怎么工作的?**
    *要点*:Driver 持续统计 Task 完成时间中位数,超过 1.5 倍的 Task 在另一台 Executor 重跑;谁先成功用谁的结果。源码 `TaskSchedulerImpl#speculativeTasks`。
12. **Shuffle 数据压缩用哪种算法?**
    *要点*:默认 `spark.shuffle.compress=true + spark.io.compression.codec=lz4`,吞吐高;CPU 紧张场景用 zstd(`spark.io.compression.codec=zstd`)。
13. **Shuffle Spill(Memory) 过高怎么调?**
    *要点*:调大 `spark.shuffle.spill.numElementsForceSpillThreshold`(默认 200w),减少合并次数,代价是 GC 压力上升。或者调大 Executor 内存。
14. **Sort Merge Join 的代价主要在哪?**
    *要点*:`sort + shuffle + merge`,Shuffle 量决定一切。Broadcast Hash Join 不需要 Shuffle,所以大表 join 小表优先选 Broadcast(默认 `spark.sql.autoBroadcastJoinThreshold=10m`)。

---

## 12. 一张图回顾 Spark 调度全链路

```
  Spark Driver
    │
    ├─ DAGScheduler ─── createResultStage ──┐
    │   │                                     │
    │   └─ submitMissingTasks                 │
    │         └─ TaskSet(200 Task)             ▼
    │                                taskScheduler.submitTasks
    ├─ TaskSchedulerImpl                        │
    │   └─ TaskSetManager.resourceOffer         ▼
    │         └─ 选 Executor (Locality)         ▼
    ├─ YarnSchedulerBackend                     ▼
    │   └─ ReviveOffers RPC ──> RM             ▼
    │   └─ AllocateResponse(List[Container])    ▼
    │                               startContainer(NM)
    │
    │                                        ┌─ NM 启动 Executor
    │                                        ▼
    │   executorEndpoint.send(LaunchTask) ──> Executor
    │                                          │
    │                                          └─ TaskRunner.run
    │                                                └─ RDD.compute
    │                                                      └─ read/write Shuffle
    │
    └─ Task 完成 ──> CoarseGrainedSchedulerBackend.statusUpdate
                       └─ DAGScheduler.handleTaskCompletion
                             └─ 标记完成 / 重试 / 推 Stage
```

---

## 13. 小结与下一章预告

- Spark 调度 = DAGScheduler(切 Stage) + TaskScheduler(选 Task) + SchedulerBackend(集群通信),三者解耦是 Spark on K8s/YARN/Mesos/Standalone 都支持的基础。
- Shuffle(Hash → Sort → Tungsten Sort)演进是"内存 IO 优化"的教科书案例,BlockManager 是数据读写的核心抽象。
- 下一章 [04-Spark SQL 与 Catalyst / Tungsten],我们进入 Spark 最常用的 API,SQL 编译器五阶段、Tungsten 内存管理、Codegen、Adaptive Query Execution 是面试必考点。