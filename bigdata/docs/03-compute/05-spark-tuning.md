# 05. Spark 性能调优:内存 / 数据倾斜 / Join / Shuffle

> **本章定位**:Spark 调优是 50K 面试的"压轴题"。本章把内存模型、数据倾斜 7 种解法、Join 策略、Shuffle 调优、动态资源分配一次性讲透。每一种解法都给出可运行的伪代码片段,生产上直接用得上。

---

## 1. Spark 内存模型(Unified Memory)

```
 ┌───────────────────────────────────────────────────────────┐
 │              JVM Heap (默认 4 GB)                          │
 ├───────────────────────────────────────────────────────────┤
 │  Reserved Memory          300 MB  (固定)                  │
 ├───────────────────────────────────────────────────────────┤
 │  User Memory              40%                              │
 │  - UDF / Spark SQL 函数 / 自定义数据结构                   │
 ├───────────────────────────────────────────────────────────┤
 │  Unified Memory           60% (spark.memory.fraction)     │
 │  ┌────────────────────┬─────────────────────────────┐     │
 │  │  Storage Memory    │  Execution Memory            │     │
 │  │  50% (默认)        │  50%                         │     │
 │  │  - cache RDD      │  - shuffle / join / agg / sort │     │
 │  │  - broadcast var  │  - task 计算                    │     │
 │  └────────────────────┴─────────────────────────────┘     │
 │       ↑ 动态抢占(spark.memory.storageFraction=0.5)         │
 ├───────────────────────────────────────────────────────────┤
 │  (堆外:OffHeap Memory, spark.unsafe.offHeap=true 时启用)  │
 │  - Tungsten UnsafeRow / Shuffle / Cache                    │
 └───────────────────────────────────────────────────────────┘
```

### 1.1 关键参数

| 参数 | 默认 | 推荐 |
| --- | --- | --- |
| `spark.executor.memory` | 1g | 8-32g |
| `spark.memory.fraction` | 0.6 | 0.6-0.7 |
| `spark.memory.storageFraction` | 0.5 | 0.3-0.5 |
| `spark.memory.useLegacyMode` | false | false |
| `spark.unsafe.offHeap` | false | true(大表) |
| `spark.unsafe.offHeap.size` | 0 | 4-16g |

### 1.2 内存分配源码

源码:`org.apache.spark.memory.UnifiedMemoryManager`

```scala
private[memory] case class MemoryPool(
    lock: Object,
    memoryMode: MemoryMode,
    initialPoolSize: Long,
    maxPoolSize: Long
) extends EvictableMemoryPool[MemoryEntry]

// acquireStorageMemory:Storage 占满后,执行可抢占其剩余
// acquireExecutionMemory:Execution 占满后,Storage 不能抢占 → 阻塞
```

**关键点**:Execution 比 Storage 优先,Storage 满了可以落盘,Execution 满了直接 OOM。

### 1.3 内存溢出(OOM)案例与解法

| 症状 | 原因 | 解法 |
| --- | --- | --- |
| `OutOfMemoryError: GC overhead limit exceeded` | 内存不够,频繁 GC | 调大 executor 内存或降低 storageFraction |
| `Container killed by YARN for exceeding memory limits` | JVM 堆用满 + 堆外内存 | `spark.yarn.executor.memoryOverhead` 调大 |
| shuffle spill 巨大 | execution 不够 | 调大 `spark.memory.fraction` |
| broadcast OOM | broadcast 表太大 | `spark.sql.autoBroadcastJoinThreshold` 调小 + 显式 `broadcast hint` |

---

## 2. 数据倾斜 7 种解法

### 2.1 什么是数据倾斜

```
        Stage 1
      ┌─────────┐
      │   task0 │ 1 GB data
      │   task1 │ 1 GB data
      │   task2 │ 1 GB data
      │   task3 │ 200 GB data   ← 单个 task 拖后腿
      │   task4 │ 1 GB data
      └─────────┘
```

**症状**:
- Spark UI:某个 stage 卡 99%,只有少数 task 没完成。
- 日志:`Shuffle Read:200 GB` 单个 partition。
- Task Duration P99 >> P50,方差巨大。

### 2.2 解法一:两阶段聚合(局部聚合 + 全局聚合)

适用:聚合类操作(`groupByKey`, `reduceByKey`, `aggregateByKey`)。

原理:
```
原始:  rdd.reduceByKey(+)      // 单个 task 拉所有 key,shuffle 大
方案:  rdd.reduceByKey(+)      // 局部聚合 (输出 < 输入)
       .reduceByKey(+)         // 全局聚合 (shuffle 小)
```

代码示例:统计每个 key 的 count。

```scala
// code/spark/skew-2phase-aggregate.scala
val raw = sc.textFile("hdfs:///data/events").map { line =>
  val arr = line.split(",")
  (arr(0), 1)
}

// 错误:直接 reduceByKey,key 倾斜时单 task 巨大
// val counts = raw.reduceByKey(_ + _)

// 正确:两阶段
val first = raw.reduceByKey(_ + _)  // 局部聚合
val counts = first.reduceByKey(_ + _)  // 全局聚合
counts.saveAsTextFile("hdfs:///out")
```

### 2.3 解法二:加盐(Salt + Prefix)

适用:join 倾斜(大表 join 小表,或大表 join 大表某 key 集中)。

原理:
```
原始 join:
    bigTable ⋈ smallTable (key)
    bigTable 中 key='A' 占 90%,shuffle 后 single reducer

加盐:
    bigTable: key='A' 加随机前缀 → ('A_0', 'A_1', ..., 'A_99')
    smallTable: 复制 100 倍 → ('A_0', 'A_1', ..., 'A_99') 各一份
    shuffle 后 100 个 reducer 分摊
```

代码示例:

```scala
// code/spark/skew-salt-join.scala
val big = spark.read.parquet("hdfs:///data/big_orders")
val small = spark.read.parquet("hdfs:///data/small_users")

// big 加盐
val saltedBig = big.withColumn("salt", (rand() * 100).cast("int"))
  .withColumn("new_key", concat_ws("_", col("user_id"), col("salt")))

// small 复制 100 倍
val exploded = (0 until 100).foldLeft(small) { (df, i) =>
  df.withColumn("salt", lit(i)).withColumn("new_key", concat_ws("_", col("user_id"), col("salt")))
}.union(small)  // 再 union 100 次

val joined = saltedBig.join(exploded, "new_key").drop("salt").drop("new_key")
```

### 2.4 解法三:随机前缀 + 范围分区

适用:join 倾斜 + key 范围分布不均。

```scala
val bigRDD = ... // (key, value)
val saltedRDD = bigRDD.map { case (k, v) =>
  val prefix = scala.util.Random.nextInt(1000)
  (s"$prefix|$k", v)
}
// rangePartitioner 重分区,把高基数 key 拆散
```

### 2.5 解法四:Broadcast Join 替换 Shuffle Join

适用:大表 join 小表(<10MB)。

```scala
import org.apache.spark.sql.functions.broadcast
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", 10485760)  // 10 MB

// 方式 1:配置自动
val result = bigDF.join(smallDF, "key")

// 方式 2:显式 hint
val result = bigDF.join(broadcast(smallDF), "key")

// 方式 3:Catalyst hint
val result = bigDF.join(smallDF.hint("BROADCAST"), "key")
```

### 2.6 解法五:AQE 自适应处理倾斜(Spark 3.x)

```properties
spark.sql.adaptive.enabled=true
spark.sql.adaptive.skewJoin.enabled=true
spark.sql.adaptive.skewJoin.skewedPartitionFactor=5
spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256m
```

原理:运行时检测,大 partition 自动拆成多个小 partition + 随机前缀。

源码:`org.apache.spark.sql.execution.adaptive.rule.CoalesceShufflePartitions + OptimizeSkewedJoin`。

### 2.7 解法六:过滤倾斜 key

```scala
// 找出倾斜 key
val hotKeys = df.groupBy("key").count()
  .orderBy(desc("count")).limit(10)
  .collect().map(_.getString(0))

// 拆分
val hotDF = df.filter(col("key").isin(hotKeys: _*))
val normalDF = df.filter(!col("key").isin(hotKeys: _*))

// 分别处理
val hotResult = hotDF.map { ... }  // 特殊逻辑,比如枚举
val normalResult = normalDF.groupBy("key").agg(...)
val finalResult = hotResult.union(normalResult)
```

### 2.8 解法七:Reduce Task 并发上限 + 加大单 task 数据

适用:倾斜不严重,可通过调参缓解。

```properties
# Reduce 并发
spark.sql.shuffle.partitions=400   # 默认 200,加大
# Reduce 单 task 数据
spark.sql.adaptive.advisoryPartitionSizeInBytes=64m  # 默认 128m,减小
```

### 2.9 七种解法速查表

| 解法 | 适用场景 | 难度 | 效果 |
| --- | --- | --- | --- |
| 两阶段聚合 | 聚合 skew | ⭐ | ⭐⭐⭐⭐ |
| 加盐 join | join skew | ⭐⭐ | ⭐⭐⭐⭐ |
| 随机前缀 | range skew | ⭐⭐ | ⭐⭐⭐ |
| Broadcast | 大+小 | ⭐ | ⭐⭐⭐⭐⭐ |
| AQE | 通用 | ⭐ | ⭐⭐⭐⭐ |
| 过滤 hot key | 业务已知 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 调参 | 轻微 | ⭐ | ⭐⭐ |

---

## 3. Join 策略全景

### 3.1 五种 Join 策略

```
  BroadcastNestedLoopJoin      ShuffleNestedLoopJoin
       │                             │
       │ 无 Shuffle                   │ 全 Shuffle(N×M)
       │                             │
       ▼                             ▼
  BroadcastHashJoin          ShuffleHashJoin
       │  build hash                     │  build hash
       │  small table                    │  small side
       │                             │
       └──────────────┬────────────────┘
                      │
                      ▼ SortMergeJoin
                  两边 sort + merge
```

### 3.2 各 Join 适用条件

源码:`org.apache.spark.sql.execution.SparkStrategies.JoinSelection`

| 策略 | 触发条件 | 适用数据量 |
| --- | --- | --- |
| BroadcastNestedLoopJoin | 非等值 join,小表 | 一边 < 10 MB |
| BroadcastHashJoin | 等值 join,小表 | 一边 < `autoBroadcastJoinThreshold` |
| ShuffleHashJoin | 等值 join + 一边小 | 一边 < `spark.sql.shuffleHashJoinFactor`(默认 100 MB) |
| SortMergeJoin | 默认,等值 join | 两边都大 |
| CartesianProduct | 无 join key | 极小数据,生产几乎不用 |

### 3.3 关键参数

```properties
spark.sql.autoBroadcastJoinThreshold=10m     # broadcast 阈值
spark.sql.broadcastTimeout=300s              # broadcast 超时
spark.sql.shuffle.partitions=200             # shuffle 分区数
spark.sql.join.preferSortMergeJoin=true      # 默认走 SortMerge
```

### 3.4 强制指定 Join 策略

```scala
import org.apache.spark.sql.catalyst.plans.JoinStrategy

// 方式 1:SQL Hint
SELECT /*+ BROADCAST(small) */ * FROM big JOIN small ON big.id = small.id

// 方式 2:DataFrame hint
bigDF.join(smallDF.hint("BROADCAST"), "id")
bigDF.join(smallDF.hint("SHUFFLE_MERGE"), "id")
bigDF.join(smallDF.hint("SHUFFLE_HASH"), "id")

// 方式 3:禁用 broadcast
bigDF.join(smallDF.hint("MERGE"), "id")
```

---

## 4. Shuffle 调优

### 4.1 Shuffle 数据生命周期

```
  Map Task
     ├─ 写:PartitionedAppendOnlyMap(堆内存)
     ├─ 溢写:ShuffleExternalSorter 落盘
     └─ 合并:IndexFile + DataFile
            │
            ▼  ShuffleBlockFetcherIterator (Reduce 端)
  Reduce Task
     ├─ 拉:Netty BlockTransfer
     ├─ 反序列化:UnsafeRow
     └─ 聚合 / Sort / Join
```

### 4.2 关键 Shuffle 参数

| 参数 | 默认 | 优化方向 |
| --- | --- | --- |
| `spark.shuffle.file.buffer` | 32 KB | 大磁盘调大 64 KB,减少磁盘 IO 次数 |
| `spark.shuffle.spill.numElementsForceSpillThreshold` | 200w | 内存紧张时调小(50w) |
| `spark.shuffle.compress` | true | 启用 |
| `spark.shuffle.sort.bypassMergeThreshold` | 200 | map 数 > 200 时禁用 bypass |
| `spark.shuffle.io.maxRetries` | 3 | 重试次数 |
| `spark.shuffle.io.retryWait` | 5s | 重试间隔 |
| `spark.reducer.maxBlocksInFlightPerAddress` | Int.MaxValue | 大 shuffle 调小 5-10 |
| `spark.reducer.maxSizeInFlight` | 48m | shuffle 拉数据缓冲,内存紧张调小 |

### 4.3 Shuffle 压缩算法选择

```properties
spark.io.compression.codec=lz4       # 速度快,压缩比一般
spark.io.compression.codec=zstd       # 压缩比好,速度略慢
spark.io.compression.zstd.level=3     # 默认 3,1-22 越大越慢
spark.io.compression.lz4.buffersize=512k
```

生产经验:
- 数据量小 + CPU 紧:`lz4`。
- 数据量大 + 存储紧:`zstd`。

### 4.4 外部 Shuffle Service

启用 `spark.shuffle.service.enabled=true` + YARN 上的 `YarnShuffleService`,把 shuffle 数据持久化在 NM 上,Application 重启后 map output 还在,不用重算。

生产上强烈推荐开启。

---

## 5. Join 策略深度源码

### 5.1 BroadcastHashJoinExec 关键源码

源码:`org.apache.spark.sql.execution.joins.BroadcastHashJoinExec#doExecute`

```scala
override protected def doExecute(): RDD[InternalRow] = {
  val broadcasted = broadcast.execute()  // 先 broadcast 小表
  val broadcastRelation = broadcasted.value  // 拿到 Broadcast[HashMap]
  stream.execute().mapPartitions { streamIter =>
    val hashMap = broadcastRelation.value
    val hashed = HashedRelation(hashMap, buildKeyGenerator)
    streamIter.filterJoinedRows(hashed)  // 对每行探测 hash
  }
}
```

**优化**:
- `HahedRelation` 用 `JavaHashMap` 或 `BytesToBytesMap`(Tungsten)。
- 单 partition 数据 1 GB 以上,`BytesToBytesMap` 走堆外,避免 GC。

### 5.2 SortMergeJoinExec 关键源码

源码:`org.apache.spark.sql.execution.joins.SortMergeJoinExec#doExecute`

```scala
override protected def doExecute(): RDD[InternalRow] = {
  // 1. 子节点已 sort
  val leftIter = left.execute().mapPartitions(_.sorted)
  val rightIter = right.execute().mapPartitions(_.sorted)
  // 2. 归并两个 sorted iterator
  new SortMergeJoinRDD(leftIter, rightIter, joinKey, joinType)
}

class SortMergeJoinIterator {
  // 双指针归并
  def next(): InternalRow = {
    while (leftKey == rightKey) {
      // 找到两边 key 相等的所有对,做笛卡尔积 + filter
      emit joined rows
    }
  }
}
```

### 5.3 选择 Join 的源码逻辑

源码:`JoinSelection#apply`(SparkPlanner 内部):

```scala
def apply(plan: LogicalPlan): Seq[SparkPlan] = plan match {
  case Join(left, right, _, _, hint) =>
    // 1. hint 优先
    val joinHint = ...
    // 2. 优先 broadcast
    if (canBroadcast(left)) BroadcastHashJoin(left, right) :: Nil
    else if (canBroadcast(right)) BroadcastHashJoin(right, left) :: Nil
    // 3. 一边小 → shuffle hash
    else if (smallSideEstimatedBytes < shuffleHashJoinFactor) ShuffleHashJoin :: Nil
    // 4. 默认 sort merge
    else SortMergeJoin :: Nil
}
```

---

## 6. 动态资源分配

### 6.1 开启条件

```properties
# Spark
spark.dynamicAllocation.enabled=true
spark.dynamicAllocation.minExecutors=2
spark.dynamicAllocation.maxExecutors=100
spark.dynamicAllocation.initialExecutors=10
spark.dynamicAllocation.executorIdleTimeout=60s
spark.dynamicAllocation.cachedExecutorIdleTimeout=120s
spark.dynamicAllocation.schedulerBacklogTimeout=10s
spark.shuffle.service.enabled=true   # 必备
```

### 6.2 原理

源码:`org.apache.spark.scheduler.cluster.CoarseGrainedSchedulerBackend#reviveOffers` + `ExecutorAllocationManager`

```
  ┌─────────────────────────────────────────────┐
  │     ExecutorAllocationManager (Driver 端)   │
  ├─────────────────────────────────────────────┤
  │ - addTime:Task积压时间                       │
  │ - removeTime:Executor空闲时间                 │
  │ - numExecutorsTarget:动态目标                │
  │                                              │
  │  任务积压超过 schedulerBacklogTimeout (10s): │
  │    requestExecutors(numExecutorsTarget + 1)   │
  │  空闲 Executor 超过 executorIdleTimeout (60s):│
  │    killExecutor(executorId)                   │
  └─────────────────────────────────────────────┘
```

### 6.3 与 External Shuffle Service 配合

如果不开 Shuffle Service,Executor 被 kill 后,Shuffle 数据丢失,下游 task 报错。开启后,Shuffle 数据在 NM 上,Executor 重启后可继续用。

---

## 7. 数据本地性调优

| 参数 | 默认 | 推荐 |
| --- | --- | --- |
| `spark.locality.wait.process` | 3s | 10s |
| `spark.locality.wait.node` | 3s | 3s |
| `spark.locality.wait.rack` | 0s | 0s |
| `spark.locality.wait.any` | 0s | 0s |

**生产经验**:调大 `process` 等待时间,优先让 task 跑在 block 所在进程;但调太大也会延迟任务。

---

## 8. 序列化与压缩

### 8.1 Kryo 序列化

```properties
spark.serializer=org.apache.spark.serializer.KryoSerializer
spark.kryo.registrationRequired=false
spark.kryo.registrator=com.bigdata.MyKryoRegistrator
spark.kryo.unsafe=true
```

```scala
class MyKryoRegistrator extends KryoRegistrator {
  override def registerClasses(kryo: Kryo): Unit = {
    kryo.register(classOf[MyOrder])
    kryo.register(classOf[MyUser])
  }
}
```

Kryo 比 Java 序列化快 5-10x,体积小 30-50%。

### 8.2 Parquet / ORC 列存压缩

```properties
spark.sql.parquet.compression.codec=snappy
spark.sql.parquet.enableDictionary=true
spark.sql.parquet.filterPushdown=true
spark.sql.orc.compression.codec=zstd
```

---

## 9. 故障排查清单

| 症状 | 排查步骤 |
| --- | --- |
| Task 长尾 | Spark UI → Stages → 看 task duration 分布;定位大 partition |
| Executor OOM | Spark UI → Executors → GC Time;`spark.memory.fraction` |
| Shuffle 失败 | NM log → `Failed to fetch`;调 `spark.network.timeout` |
| Driver OOM | `spark.driver.memory` 调大,降低 `spark.sql.shuffle.partitions` |
| Stage 失败 | spark-driver log → 找 cause;`spark.task.maxFailures` |
| Job 卡住 | Driver log → 找 "Lost task" / "NotSerializableException" |

---

## 10. 生产实战任务

### 10.1 任务一:数据倾斜诊断

```scala
// code/spark/skew-diagnose.scala
val df = spark.read.parquet("hdfs:///data/orders")

// 找出 top 10 倾斜 key
val hotKeys = df.groupBy("user_id").count()
  .orderBy(desc("count")).limit(10)
hotKeys.show()

// 看分区大小
df.groupBy(spark_partition_id()).count().show()
// 注意:spark_partition_id 是 input partition,不是 shuffle partition
```

### 10.2 任务二:加盐 Join

```scala
// code/spark/skew-salt-join.scala
def saltJoin(bigDF: DataFrame, smallDF: DataFrame, key: String, saltCount: Int): DataFrame = {
  // 大表加盐
  val bigSalted = bigDF.withColumn("salt", (rand() * saltCount).cast("int"))
    .withColumn("salt_key", concat_ws("_", col(key), col("salt")))

  // 小表展开
  val saltValues = (0 until saltCount).toList
  val smallExploded = saltValues.foldLeft(smallDF) { (df, salt) =>
    df.withColumn("salt", lit(salt))
      .withColumn("salt_key", concat_ws("_", col(key), col("salt")))
  }

  bigSalted.join(smallExploded, "salt_key").drop("salt").drop("salt_key")
}
```

### 10.3 任务三:自适应 AQE

```sql
SET spark.sql.adaptive.enabled = true;
SET spark.sql.adaptive.skewJoin.enabled = true;
SET spark.sql.adaptive.skewJoin.skewedPartitionFactor = 5;
SET spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes = 256m;

-- 倾斜 join,加 EXPLAIN 看 AQE 后的 plan
EXPLAIN
SELECT /*+ SHUFFLE_MERGE(b) */
  a.user_id, SUM(a.amount)
FROM orders a JOIN users b ON a.user_id = b.id
GROUP BY a.user_id;
```

### 10.4 任务四:Join 策略选择压测

```scala
// code/spark/join-benchmark.scala
import org.apache.spark.sql.functions.broadcast
val big = spark.range(0, 100000000).selectExpr("id", "id % 1000 as key", "id as value")
val small = spark.range(0, 1000).selectExpr("id as user_id", "name")

// 1. SortMergeJoin (默认)
val result1 = big.join(small, big.col("key") === small.col("user_id")).count()

// 2. BroadcastHashJoin
val result2 = big.join(broadcast(small), big.col("key") === small.col("user_id")).count()

// 3. ShuffleHashJoin
val result3 = big.hint("SHUFFLE_HASH").join(small.hint("SHUFFLE_HASH"),
  big.col("key") === small.col("user_id")).count()

// 比较时长
```

### 10.5 任务五:动态 Executor 调

```bash
spark-submit \
  --master yarn \
  --conf spark.dynamicAllocation.enabled=true \
  --conf spark.shuffle.service.enabled=true \
  --conf spark.dynamicAllocation.minExecutors=5 \
  --conf spark.dynamicAllocation.maxExecutors=200 \
  --conf spark.dynamicAllocation.executorIdleTimeout=30s \
  --conf spark.dynamicAllocation.schedulerBacklogTimeout=5s \
  ...
```

---

## 11. 专家面试题

1. **Spark 内存模型分几块?各占多少?**
   *要点*:User Memory 40%,Unified Memory 60%(含 Storage + Execution,默认各占一半)。Source: `UnifiedMemoryManager`。
2. **数据倾斜七种解法分别适用什么场景?**
   *要点*:两阶段聚合(ReduceByKey)、加盐(join skew)、Broadcast(大+小)、AQE(Spark 3.x)、随机前缀(range skew)、过滤 hot key、Reduce 并发调参。
3. **SortMergeJoin 的代价?**
   *要点*:两边 sort 后 merge,Shuffle 决定一切。大表 join 必须 SortMerge 或 Broadcast,Shuffle Hash Join 适合一边小(<100MB)。
4. **AQE 在哪个阶段生效?**
   *要点*:PrepareForExecution 阶段,运行期根据 statistics 调整 plan(合并 partition + skew join 拆分)。
5. **Kryo 序列化比 Java 快在哪?**
   *要点*:直接写字节,不写类名,无反射。Unsafe Kryo 用堆外内存,0 GC。
6. **Spark 如何定位数据倾斜?**
   *要点*:Spark UI → Stages → 看 task duration 分布;`Shuffle Read Size` 找大 partition;`df.groupBy(spark_partition_id()).count` 看行数分布。
7. **Broadcast Hash Join 的限制?**
   *要点*:小表需小于 `autoBroadcastJoinThreshold`(默认 10MB);大数据 broadcast 会 OOM Driver + Executor。
8. **Dynamic Allocation 必须开启什么?**
   *要点*:必须开启 `spark.shuffle.service.enabled=true`,否则 Executor 被 kill 后 shuffle 数据丢失。
9. **Shuffle 数据压缩对吞吐的影响?**
   *要点*:压缩减少磁盘 IO + 网络传输,代价是 CPU。`spark.shuffle.compress=true`,生产推荐 `lz4` 或 `zstd`。
10. **Tungsten Sort 比 Sort Shuffle 强在哪?**
   *要点*:堆外内存 + radix sort + 序列化字节直接操作,减少 GC;`ShuffleExternalSorter`。
11. **Spark 如何调大 Sort Stage 的 partition 数?**
    *要点*:`spark.sql.shuffle.partitions=200` 是默认值,大表调到 500-1000;`AQE` 开启后 `spark.sql.adaptive.advisoryPartitionSizeInBytes=128m` 自动控制。
12. **Spark SQL 的 JOIN 顺序会自动优化吗?**
    *要点*:Spark 3.x 用 CBO + `JoinReorderDP` 动态规划求最优 join 顺序;前提是 `ANALYZE TABLE` 收集统计信息。
13. **Spill (Disk) 很高怎么调?**
    *要点*:调大 `spark.shuffle.spill.numElementsForceSpillThreshold`(默认 200w)或调大 Executor 内存。
14. **Speculative Execution 怎么开?**
    *要点*:`spark.speculation=true`, `spark.speculation.multiplier=1.5`(比中位数慢 1.5 倍),`spark.speculation.quantile=0.75`(75% 任务完成才开始推测)。

---

## 12. 一张图回顾 Spark 调优全景

```
  Spark 调优
  ├─ 内存模型
  │  ├─ User 40%   (UDF / SQL 函数)
  │  ├─ Unified 60% (Storage 50% + Execution 50%)
  │  └─ 堆外 Tungsten (UnsafeRow)
  │
  ├─ 数据倾斜(7 种)
  │  ├─ 两阶段聚合
  │  ├─ 加盐 join
  │  ├─ Broadcast
  │  ├─ AQE
  │  ├─ 随机前缀
  │  ├─ 过滤 hot key
  │  └─ 调参
  │
  ├─ Join 策略
  │  ├─ BroadcastNestedLoop (非等值)
  │  ├─ BroadcastHash (一边小)
  │  ├─ ShuffleHash (一边小)
  │  └─ SortMerge (默认,等值)
  │
  ├─ Shuffle
  │  ├─ SortShuffleWriter (默认)
  │  ├─ BypassMerge (map < 200)
  │  ├─ UnsafeShuffleWriter (Tungsten)
  │  └─ 外部 Shuffle Service (NM 持久化)
  │
  └─ 资源
     ├─ Dynamic Allocation
     ├─ Speculative Execution
     └─ Locality Wait
```

---

## 13. 小结与下一章预告

- **调优的根**:把 Spark 内存模型、Join 策略、Shuffle 三者融会贯通,面试时 80% 的调优问题都能答到点上。
- **数据倾斜 7 种解法**是 50K 面试必考,务必背熟。
- 下一章 [06-Flink 核心原理],我们进入流式计算的代表:Flink 的 StreamGraph → JobGraph → ExecutionGraph 三层图转换、Slot 共享、MailBox 反压模型。