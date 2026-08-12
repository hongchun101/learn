# 01. MapReduce 原理与源码

> **本章定位**:从代码层面理解 MapReduce 的 Shuffle、Combiner、Partitioner、RecordReader、DataLocality。Spark/Flink 都从 MR 继承了一部分语义,理解 MR 是理解后续引擎的基础。这一章我们要 **逐行看源码**,真正达到"50K 候选人讲出 `org.apache.hadoop.mapred.MapTask#run` 中 100 MB 环形缓冲、`io.sort.mb` 默认值"的水准。

---

## 1. MapReduce 的两阶段抽象

MapReduce 把所有分布式计算抽象成两个函数:

```
       InputFormat                                  OutputFormat
   (K1,V1)            map()              shuffle              reduce()
   ┌─────────┐    ────────────────    ────────────────    ────────────────
   │  HDFS    │ →  (K2,V2) -> list   sort + partition +   (K3, list<V2>) -> (K3, V3)
   │  block   │    (K2,V2')          group + merge        │
   └─────────┘    ────────────────    ────────────────    ────────────────
                       │                      │                   │
                  MapOutputBuffer         网络/磁盘           Reduce 端 sort+merge
                  环形缓冲 100MB         fetch+merge
```

四个角色:
- **InputFormat**:决定怎么把 HDFS block 切成 `(K1, V1)` 给 map 函数。默认 `TextInputFormat`,一行一条记录。
- **Partitioner**:决定 map 输出的 `(K2, V2)` 去哪个 reduce。默认 `HashPartitioner`,基于 `key.hashCode() & Integer.MAX_VALUE % numReduceTasks`。
- **Combiner**:本地 reduce,在 map 端预聚合,减少 shuffle 数据量。比如 `word count` 中 `map(article, line) -> (word, 1)`,加 combiner 后 `reduce -> (word, count)`,网络传输从 100 亿条降到几万条。
- **OutputFormat**:决定 reduce 输出怎么写回 HDFS。默认 `TextOutputFormat`,每行 `key\tvalue`。

---

## 2. Map 端源码深潜

### 2.1 MapTask 入口

源码位置:`hadoop-mapreduce-client-core/src/main/java/org/apache/hadoop/mapred/MapTask.java`

```
MapTask.run()
   └─ if (job cleanup) → runJobCleanupTask()
   └─ else if (job setup) → runJobSetupTask()
   └─ else if (task cleanup) → runTaskCleanupTask()
   └─ else → runNewMapper()
         └─ mapper.run(mapperContext)
               └─ while (context.nextKeyValue())
                       mapper.map(key, value, context)
                       ├─ context.write(k, v)  →  mapOutputBuffer.collect(k, v)
               └─ MapOutputBuffer.flush()
               └─ MapOutputBuffer.close()
```

**关键点**:`mapper.map()` 写的每条 `(k,v)`,并不是直接写磁盘,而是先写 **环形缓冲区**(circular buffer)。

### 2.2 MapOutputBuffer 环形缓冲

源码位置:`MapTask.java` 内部类 `MapOutputBuffer`,字段:

```
kvmeta = byte[1024 * io.sort.record.index];   // 元数据数组(kvstart/kvend/...)
kvbuffer = byte[io.sort.mb * 1024 * 1024];     // 数据 buffer,默认 100 MB
kvindices = int[io.sort.record.percent];        // 索引,4 byte 一条
```

写入流程(简化版):

```
collect(key, value, partition)
   │
   ├─ if (bufferRemaining == 0) → sortAndSpill()  // 满了就刷
   ├─ partition = getPartition(key, value)         // 默认 hash(key) % reduce
   ├─ 序列化 key/value 到 kvbuffer
   ├─ kvmeta[2*index]  = partition
   ├─ kvmeta[2*index+1] = valueOffset
   ├─ bufferRemaining--
   └─ if (bufferRemaining < softRecordLimit) → startSpill()  // 异步后台线程开始刷
```

`io.sort.mb` 是 MapReduce 最重要的调参,默认 100 MB。调大的好处:减少 spill 次数;代价:每个 TaskTracker 能起的 map 数减少。

### 2.3 sortAndSpill 流程

当缓冲达到阈值(默认 80% = `io.sort.spill.percent=0.8`),后台线程 `SpillThread` 触发 `sortAndSpill()`:

```
sortAndSpill():
   1. swap map outputs to "spilled" array(避免阻塞 map)
   2. sort by (partition, key)
      - 内部快排,keyComparator 来自 JobConf("mapreduce.map.output.key.class")
   3. for each partition p in 0..numReduce-1:
        - if (combinerRunner != null) combine(p);   // ★ Combiner 触发点
        - 写到 spill file: "spill0.out", "spill1.out", ...
        - 每个 spill 内部按 partition 顺序写,partition 内按 key 排序
   4. return spill file list
```

**注意 combiner 触发条件**:`mapreduce.map.combine.class` 必须设置,且与 reducer 同类型(输出类型兼容)。

---

## 3. Shuffle 阶段源码深潜

### 3.1 shuffle 的"三段论"

整个 Shuffle 过程对用户透明,但源码分三段:

```
Map 端:                              Reduce 端:
  spill(本地磁盘)                       copy(网络拉)
       │                                   │
       ▼                                   ▼
   merge(归并)                          merge(归并)
       │                                   │
       ▼                                   ▼
   shuffle output files                 final sorted (k,v) 喂 reduce()
```

源码入口:
- Map 端:`MapTask#getPhase()` → `MapPhase.SHUFFLE_PHASE` 触发 `mergeParts()`。
- Reduce 端:`ReduceTask#run()` → `shuffleConsumerPlugin.run()`。

### 3.2 Reduce 端 Shuffle 三大子阶段

源码位置:`ReduceTask.java#run` 简化:

```
ReduceTask.run():
   ├─ rPhase = MAP;                       // map 阶段(取 map output)
   ├─ copyPhase = new ShuffleSchedulerImpl(...);   // ★ 拉数据调度器
   ├─ mergePhase = new MergeManagerImpl(...);      // ★ 归并管理
   ├─ reducePhase = new ReduceTask.ValuesIterator(...)
   ├─ while (mapOutput.size() < expectedSize)  // 等待所有 map 结束
   │      mapOutputFIFO.acquire();  // 拉到一个 map output
   │
   ├─ merge();                             // 归并到 final file
   │
   └─ reduce();                            // 调用用户 reduce 函数
```

#### 3.2.1 Copy 阶段

`ShuffleScheduler` 维护一组 `MapHost`(`ShuffleSchedulerImpl#copyMapOutput`):
- 通过 HTTP 从 map 端 `MapOutputServlet` 拉数据。
- 默认 5 个并发:`mapreduce.reduce.shuffle.parallelcopies=5`。
- 单个 map 拉到本地后,**直接走零拷贝**(transferTo)到磁盘。
- 内存阈值:`mapreduce.reduce.shuffle.input.buffer.percent=0.7`(堆的 70%),超过就溢写到磁盘。
- map 端 HTTP 服务由 `MapOutputServlet#writeMapOutput` 提供。

#### 3.2.2 Merge 阶段

`MergeManagerImpl#merge`:
- 内存段 → 磁盘段(`OnDiskMapOutput`)。
- 多路归并,默认每 100 个文件合并一次(`mapreduce.reduce.merge.inmem.threshold=1000`)。
- 最后一轮归并后产生 `file.out`(`MapOutput` 最终产物),输出按 key 排序。

#### 3.2.3 Reduce 阶段

`ReduceTask#ReduceValuesIterator`:
- 从 `file.out` 顺序读,按 key 分组,调用 `reducer.reduce(key, Iterator<value>, Context)`。
- 用户 reduce 输出 `(k3, v3)`,通过 `OutputFormat` 写到 HDFS。

---

## 4. Partitioner 详解

### 4.1 默认 HashPartitioner

源码:`org.apache.hadoop.mapreduce.lib.partition.HashPartitioner`

```scala
class HashPartitioner[K, V] extends Partitioner[K, V] {
  override def getPartition(key: K, value: V, numReduceTasks: Int): Int = {
    (key.hashCode() & Integer.MAX_VALUE) % numReduceTasks
  }
}
```

### 4.2 自定义 Partitioner 案例:按时间分桶

```scala
class TimePartitioner extends Partitioner[Text, NullWritable] {
  override def getPartition(key: Text, value: NullWritable, numReduceTasks: Int): Int = {
    val ts = key.toString.split(",")(0).toLong
    val bucket = (ts / 3600) % 24   // 24 个时段分桶
    bucket % numReduceTasks
  }
}
```

**陷阱**:`numReduceTasks` 必须 ≥ 24,否则多个 bucket 落到同一个 reduce,顺序混乱。

### 4.3 TotalOrderPartitioner(范围分区)

对 **全排序输出** 场景(全量数据按 key 排序),`TotalOrderPartitioner` 通过采样(`InputSampler`)算出每个 reduce 的 key 范围,保证 reduce i 输出的 key 全部 ≤ reduce i+1 输出的 key:

```
Sampler → 采样 1% 数据 → 计算 partition 边界
           → 写 trie tree 到 HDFS
           → Task 通过 DistributedCache 读取 trie
           → partition(key) = binarySearch(trie, key)
```

生产用法:`SET hive.enforce.bucketing=true; SET hive.enforce.sorting=true;`

---

## 5. Combiner 详解

### 5.1 Combiner 的本质

Combiner 是 **运行在 map 端的本地 reducer**,目的是减少 map → reduce 之间的网络传输数据量。Spark 的 `reduceByKey` / Flink 的 `reduce` 都继承了这个思想。

### 5.2 源码触发点

```
MapTask#sortAndSpill
   └─ combinerRunner.combine(reduceTask.getCombineCollector(...))
        └─ if combiner != null:
              combiner.reduce(mapperOutputKey, iterator(values), collector)
        └─ else:
              collector.collect(k, v)
```

触发条件:
- `JobConf.setCombinerClass(MyCombiner.class)`。
- Combiner 与 Reducer 类必须兼容(输入输出类型一致)。
- 默认**每个 spill 都触发一次 Combiner**,不依赖 combine 一定能完整归并。

### 5.3 Combiner 失效的经典坑

**坑 1:Combiner 改变 key 顺序**
- Combiner reduce 内部如果做 `groupBy`,后续 map 端归并后顺序可能乱,reduce 端拿到 `iterator` 不再是有序的。
- 解法:Combiner 函数必须是 **幂等 + 满足结合律**,典型如 `sum`, `max`。

**坑 2:Combiner 与 Reducer 输入/输出类型不一致**
- 比如 Combiner 输出 `Text`,Reducer 输入 `IntWritable`,运行时报 `ClassCastException`。

**坑 3:`reduce` 阶段被强行合并**
- 某些 reducer 的逻辑依赖原始顺序(比如计算 distinct 用户数),Combiner 会把同一个 key 的多条数据"合并",导致语义变化。

---

## 6. RecordReader 详解

### 6.1 InputFormat 与 RecordReader 关系

```
InputFormat(K, V):
   ├─ getSplits(JobContext) → List<InputSplit>          // 分片
   ├─ createRecordReader(InputSplit, TaskAttemptContext) → RecordReader   // 解析器
   └─ getRecordReader(...).setConf(...)  → 调用 read

RecordReader(K, V):
   ├─ initialize(InputSplit, TaskAttemptContext)
   ├─ nextKeyValue(): Boolean
   ├─ getCurrentKey(): K
   └─ getCurrentValue(): V
```

### 6.2 TextInputFormat 默认实现

源码:`org.apache.hadoop.mapreduce.lib.input.TextInputFormat`

```java
public class TextInputFormat extends FileInputFormat<LongWritable, Text> {
  public RecordReader<LongWritable, Text> createRecordReader(
      InputSplit genericSplit, TaskAttemptContext context) {
    // LineRecordReader: 一行 = 一条记录,key = byteOffset, value = line text
    return new LineRecordReader();
  }
}
```

### 6.3 自定义 RecordReader 案例:解析 CSV

```scala
class CsvRecordReader extends RecordReader[LongWritable, Array[String]] {
  private var lineReader: LineRecordReader = _
  private var pos: LongWritable = _
  private var value: Array[String] = _

  override def initialize(split: InputSplit, context: TaskAttemptContext): Unit = {
    lineReader = new LineRecordReader()
    lineReader.initialize(split, context)
  }

  override def nextKeyValue(): Boolean = {
    if (lineReader.nextKeyValue()) {
      pos = lineReader.getCurrentKey
      value = lineReader.getCurrentValue.toString.split(",")
      true
    } else false
  }
  // ...
}
```

**注意**:
- `LongWritable` 是可变 Writable,Spark 的 `mapPartitions` 不直接复用,需要重新设计。
- 多个字段拆分后,如果下游 Spark 还要按字段 join,要在 map 输出阶段就生成 `TupleN` 或自定义 bean。

### 6.4 InputFormat 在 Spark 中的等价物

| MapReduce | Spark | 说明 |
| --- | --- | --- |
| `TextInputFormat` | `textFile(path)` | 一行一条,Spark 自动 `wholeTextFiles` 目录级 |
| `KeyValueTextInputFormat` | `spark.read.csv(...)` | 字段分隔,自动推断 schema |
| `SequenceFileInputFormat` | `spark.read.sequenceFile(path)` | 二进制 Writable |
| `ParquetInputFormat` | `spark.read.parquet(path)` | 列存,Dremio 设计 |
| `OrcInputFormat` | `spark.read.orc(path)` | Hive 列存 |
| `AvroInputFormat` | `spark.read.format("avro").load(path)` | Schema 演进 |

---

## 7. DataLine 本地性深度解析

### 7.1 三级数据本地性

```
PROCESS_LOCAL   map task 进程与 block 同节点进程 → 网络 0 字节
NODE_LOCAL      map task 与 block 同一节点,不同进程 → 网络 0 字节
RACK_LOCAL      map task 与 block 同一机架,跨节点 → 跨交换机 1GB
ANY             map task 与 block 跨机架 → 跨核心交换机 10GB
```

源码:`JobInProgress#findNewMapTask`,核心字段:

```
private long dataLocalMaps;        // 数据本地命中数
private long nonLocalMaps;         // 非本地命中数
private long rackLocalMaps;        // 机架本地命中数
```

### 7.2 本地性等待机制

源码:`TaskSchedulerImpl#resourceOffers`(YARN 模式下)

```scala
val myLocalityLevels = List(PROCESS_LOCAL, NODE_LOCAL, RACK_LOCAL, ANY)
for (level <- myLocalityLevels) {
  for (task <- tasks if !task.isAssigned) {
    val matchedContainer = offerIter.find(_.host == task.preferredHost)
    if (matchedContainer != null) {
      task.assignOffer(matchedContainer)
      return ...
    }
  }
}
// 最后降级 ANY
```

**本地性等待时间**:`mapreduce.job.reduce.slowstart.completedmaps`(reduce) / `mapreduce.map.maxattempts`(失败重试)。生产上常用 `yarn.scheduler.fair.assignmultiple=false + yarn.scheduler.capacity.node-locality-delay=40`(等待 40 次心跳)。

### 7.3 生产实战:提升本地性命中率

**方法 1:节点 label**
- 关键节点贴 label,Spark 的 `preferredLocations: HadoopFsRelation#getPreferredLocations` 会读 block 位置。
- HDFS 3.x 的 `RackAware` 副本策略 + `dfs.client.short.circuit=true` 启用短路读。

**方法 2:避免大文件 + 调 split 大小**
- 默认 split = block size(128 MB),如果单文件 10 GB,只会分 78 个 map,集群利用率上不去。
- `mapreduce.input.fileinputformat.split.maxsize=64*1024*1024`,split 减半,map 数翻倍。

**方法 3:Speculative Execution**
- 慢节点拖后腿时,启动 backup task(`mapreduce.map.speculative=true`)。
- 代价:资源消耗 2x;YARN Fair Scheduler 中默认开。

---

## 8. 生产参数清单(YARN-MapReduce)

| 参数 | 默认 | 推荐值 | 说明 |
| --- | --- | --- | --- |
| `mapreduce.map.memory.mb` | 1024 | 4096-8192 | 单 map 容器内存 |
| `mapreduce.reduce.memory.mb` | 1024 | 4096-8192 | 单 reduce 容器内存 |
| `mapreduce.map.java.opts` | -Xmx 80% | -Xmx 6144m | JVM 堆 |
| `mapreduce.map.cpu.vcores` | 1 | 2-4 | vCore 数 |
| `io.sort.mb` | 100 | 256-512 | map 环形缓冲 |
| `io.sort.record.percent` | 0.05 | 同 | 元数据占比 |
| `io.sort.spill.percent` | 0.8 | 0.8-0.9 | 触发 spill 阈值 |
| `mapreduce.map.combine.class` | none | 业务类 | Combiner 类 |
| `mapreduce.job.reduces` | 1 | = 0.95 * NodeManager * Container / reduce 容器 | reduce 数 |
| `mapreduce.task.io.sort.factor` | 10 | 100 | 归并因子 |
| `mapreduce.reduce.shuffle.parallelcopies` | 5 | 10-20 | copy 并发 |
| `mapreduce.reduce.shuffle.input.buffer.percent` | 0.7 | 0.7 | shuffle 缓冲占堆比 |
| `mapreduce.reduce.merge.inmem.threshold` | 1000 | 1000 | 内存归并阈值 |
| `mapreduce.map.speculative` | false | true | 推测执行 |
| `mapreduce.reduce.speculative` | false | true | 推测执行 |

---

## 9. 生产实战任务

### 9.1 任务一:WordCount + 自定义 Combiner

```scala
// code/spark/mapreduce/wordcount/WordCount.scala (伪代码片段,Scala+MR API)
class WordCount {
  def main(args: Array[String]): Unit = {
    val conf = new JobConf(classOf[WordCount])
    conf.setJobName("word-count")
    conf.setMapperClass(classOf[WordCountMapper])
    conf.setCombinerClass(classOf[WordCountReducer])  // ★ 关键:Combiner = Reducer
    conf.setReducerClass(classOf[WordCountReducer])
    conf.setOutputKeyClass(classOf[Text])
    conf.setOutputValueClass(classOf[IntWritable])
    FileInputFormat.addInputPath(conf, new Path(args(0)))
    FileOutputFormat.setOutputPath(conf, new Path(args(1)))
    JobClient.runJob(conf)
  }
}

class WordCountMapper extends MapReduceBase with Mapper[LongWritable, Text, Text, IntWritable] {
  val word = new Text()
  val one  = new IntWritable(1)
  override def map(key: LongWritable, value: Text, ctx: OutputCollector[Text, IntWritable], reporter: Reporter): Unit = {
    value.toString.split("\\s+").foreach { w =>
      word.set(w); ctx.collect(word, one)
    }
  }
}

class WordCountReducer extends MapReduceBase with Reducer[Text, IntWritable, Text, IntWritable] {
  override def reduce(key: Text, values: Iterator[IntWritable], ctx: OutputCollector[Text, IntWritable], reporter: Reporter): Unit = {
    var sum = 0
    while (values.hasNext) sum += values.next.get
    ctx.collect(key, new IntWritable(sum))
  }
}
```

**验证**:100 MB 文本跑完,Combiner 开启后 shuffle 数据量降低 5~10 倍。

### 9.2 任务二:二次排序(Secondary Sort)

```scala
// 思路:实现 WritableComparable,先按 key 排序,key 相同再按 timestamp 排序
class OrderKey(val orderId: Int, val ts: Long)
  extends WritableComparable[OrderKey] {
  override def readFields(in: DataInput): Unit = { ... }
  override def write(out: DataOutput): Unit = { ... }
  override def compareTo(other: OrderKey): Int = {
    val c = Integer.compare(orderId, other.orderId)
    if (c != 0) c else java.lang.Long.compare(ts, other.ts)
  }
}
// JobConf.setOutputKeyComparatorClass(classOf[OrderKey.Comparator])
// JobConf.setPartitionerClass(classOf[OrderKeyPartitioner])  // 仅按 orderId 分区
```

### 9.3 任务三:全排序输出

```scala
// 使用 TotalOrderPartitioner + RandomSampler
val rand = new RandomSampler[Text, Text](0.1, 1000, 100)
val parts = rand.getSample(new JobConf(), fs, listOfFiles)
val tord = new TotalOrderPartitioner(parts, new JobConf())
// 设置 OutputFormat.setOutputPath + JobConf.setPartitionerClass(tord)
// 输出文件按 key 全排序,可直接被 Spark SQL 读取
```

---

## 10. 专家面试题

1. **MapReduce Shuffle 的 Map 端 100 MB 环形缓冲区,写满了怎么办?溢写阈值是多少?**
   *要点*:写满后调用 `MapOutputBuffer#sortAndSpill` 溢写到磁盘。阈值 `io.sort.spill.percent=0.8`,后台线程异步开始 spill,80% 后阻塞 map。
2. **Combiner 一定能让 shuffle 数据量变小吗?**
   *要点*:不一定。如果 reduce 函数不是可结合 / 幂等(比如 `distinct`、`collect`),Combiner 会破坏语义,JobConf 里不能设。
3. **HashPartitioner 在 reduce 数变化时,会重新分布数据吗?**
   *要点*:会。`(key.hashCode() & Integer.MAX_VALUE) % numReduceTasks`,reduce 数变化后所有数据重新洗牌。所以 **生产上 reduce 数一旦确定,不要再中途改**,否则重算。
4. **为什么 map 数 = split 数,而不是 block 数?**
   *要点*:split 是逻辑概念,block 是物理概念。一个 split 可以跨多个 block(文件小,block 远大于 split),一个大 block 也可被切成多个 split(小文件合并)。`FileInputFormat#computeSplitSize = max(minSize, min(maxSize, blockSize))`,默认 split = block size。
5. **map 端 spill 文件为什么按 partition 顺序写?**
   *要点*:reduce 端 copy 时按 partition 取数据,partition 顺序写,merge 阶段可以零拷贝直接 append,减少排序。
6. **RecordReader 在 Spark 中怎么对应?**
   *要点*:Spark 的 `HadoopRDD#getPartitions` 调 `InputFormat#getSplits`,`HadoopRDD#compute` 调 `RecordReader#nextKeyValue` 迭代。`wholeTextFiles` 是更简单的封装。
7. **MapReduce 的数据本地性,Spark 怎么继承?**
   *要点*:`TaskSchedulerImpl` 的 `LocalityWait`,四级降级 `PROCESS → NODE → RACK → ANY`,源码 `TaskSetManager#addPendingTask`。`spark.locality.wait.process=10s`, `spark.locality.wait.node=3s`, `spark.locality.wait.rack=0s`。
8. **reduce 端 copy 阶段为什么默认 5 个并发?**
   *要点*:`mapreduce.reduce.shuffle.parallelcopies=5`,5 路并发拉 map 输出,避免单机网卡打满。生产上根据节点数调整到 10~20。
9. **TotalOrderPartitioner 怎么保证全排序?**
   *要点*:采样 1% 数据,估算每个 reduce 的 key 范围,每个 reduce 输出一定范围,整体有序。
10. **MapReduce 的推测执行(speculative)有什么副作用?**
    *要点*:同一任务两份资源,适合慢节点故障场景,但集群资源紧张时反而加剧竞争。生产上建议开启但配合队列配额。
11. **自定义 Partitioner 时,为什么 numReduceTasks 必须 ≥ 桶数?**
    *要点*:`getPartition` 返回 `value % numReduceTasks`,如果桶数 > reduce 数,多个桶 hash 到同一个 reduce,顺序错乱。
12. **MapReduce 是否还存在 Shuffle I/O 优化空间?**
    *要点*:`netty`-based shuffle(`nettyShuffleFetcher`)替代 HTTP,内存零拷贝;`mapreduce.shuffle.ssl.enabled=true` 加安全;`external shuffle service`(MR2/YARN) 让 NodeManager 持久化 map 输出,AppMaster 失败时 map 不重跑。

---

## 11. 一张图回顾 Shuffle 全链路

```
 ┌──────────────── Map Task ─────────────────┐
 │   in(K1,V1) → map(K1,V1) → (K2,V2)        │
 │                                          │
 │   ┌─ MapOutputBuffer (100MB) ─┐          │
 │   │  80% 触发 spill           │          │
 │   │  sort by (partition, key) │          │
 │   │  combine (可选)            │          │
 │   └────────┬─────────────────┘          │
 │            │                             │
 │     spill files (local disk)              │
 └────────────┼─────────────────────────────┘
              │ HTTP (MapOutputServlet)
              ▼
 ┌──────────────── Reduce Task ──────────────┐
 │   copy(5 并发) → merge → reduce(K2, V2*) │
 │   └─ ShuffleScheduler → MergeManager     │
 │   └─ 文件: file.out(sorted)              │
 └───────────────────────────────────────────┘
```

---

## 12. 小结与下一章预告

- MapReduce 是分布式计算的"汇编语言",理解了 Shuffle、Combiner、Partitioner,后面 Spark/Flink 都是站在这个基础上做"内存 + DAG + 真流式"的优化。
- 生产上 **几乎没人直接写 MapReduce**,但所有大数据的核心概念都在这里;Spark/Flink 调试的 stack trace 也会跳进 Hadoop YARN 代码,搞不清就抓瞎。
- **下一章 [02-YARN 资源调度与源码]**:MapReduce 跑在 YARN 上,我们来看 ResourceManager、NodeManager、ApplicationMaster、Container、Fair/Capacity Scheduler、抢占、FIFO Container 这些核心组件是怎么配合的。