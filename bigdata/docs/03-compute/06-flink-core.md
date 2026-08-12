# 06. Flink 核心原理:StreamGraph / JobGraph / ExecutionGraph

> **本章定位**:Flink 的"流批一体"是它最核心的设计理念。本章把 StreamGraph → JobGraph → ExecutionGraph 的三层图转换、Slot 共享、TaskManager 调度模型、MailBox 反压机制一次性讲透,这是 50K 候选人讲"流式引擎"的硬通货。

---

## 1. Flink 三大图模型总览

Flink 运行时把一个作业抽象成 **三层图**(这与 Spark 只有一层 DAG 不同):

```
 ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
 │    StreamGraph   │───▶│     JobGraph     │───▶│  ExecutionGraph      │
 │                  │    │                  │    │  (并行化,运行时实例) │
 │ 用户 API 层       │    │ 优化层           │    │ 调度层              │
 │ Stream API       │    │ Operator Chain   │    │ Task + Slot         │
 └──────────────────┘    └──────────────────┘    └──────────────────────┘
       (用户写)              (JobManager 优化)        (TaskManager 执行)
```

### 1.1 三层图的对比

| 图 | 节点 | 边 | 创建者 | 时机 |
| --- | --- | --- | --- | --- |
| StreamGraph | StreamNode | StreamEdge | Client | 用户 API → StreamGraph |
| JobGraph | JobVertex | JobEdge | JobManager | StreamGraph + Chain |
| ExecutionGraph | ExecutionJobVertex + ExecutionVertex + IntermediateResult | 调度依赖 | JobManager | JobGraph + 并行度 |

---

## 2. StreamGraph:用户 API 层

### 2.1 创建入口

源码:`org.apache.flink.streaming.api.graph.StreamingJobGraphGenerator#createJobGraph`(其实生成 StreamGraph 是 `StreamGraph#getStreamingPlan` 等,但更清晰的方式是 `StreamExecutionEnvironment#execute()` → `getStreamGraph()`)

```scala
val env = StreamExecutionEnvironment.getExecutionEnvironment
val stream = env
  .addSource(new FlinkKafkaConsumer[String]("topic", new SimpleStringSchema, props))
  .map { x => x.toUpperCase }
  .filter(_.nonEmpty)
  .keyBy(_.hashCode % 16)
  .window(TumblingEventTimeWindows.of(Time.minutes(5)))
  .reduce((a, b) => a + "," + b)
  .addSink(new FlinkKafkaProducer[String]("out", new SimpleStringSchema, props))

val streamGraph = env.getStreamGraph
streamGraph.print()
```

### 2.2 StreamGraph 节点

源码:`org.apache.flink.streaming.api.graph.StreamNode`

每个算子在 StreamGraph 里是一个 `StreamNode`,字段:
- `id`:算子 ID(自增)。
- `operator`:算子对象(OneInputStreamOperator / TwoInputStreamOperator / Source / Sink)。
- `parallelism`:并行度。
- `bufferTimeout`:网络 buffer flush 超时(默认 100ms)。
- `inEdges` / `outEdges`:连接其他 StreamNode。

### 2.3 StreamEdge

源码:`org.apache.flink.streaming.api.graph.StreamEdge`

```
StreamEdge = 
   sourceVertexId + targetVertexId +
   partitioner (HashPartitioner / Rebalance / Forward / Broadcast / Custom) +
   exchangeMode (PIPELINED / BATCH / HYBRID)
```

**关键点**:`exchangeMode` 决定上下游是否同时跑:
- **PIPELINED**(默认):上游不阻塞,每条 record 一边产生一边下发。
- **BATCH**:上游攒一批才下发(用于批模式)。
- **HYBRID**:自适应(批/流根据数据量切换)。

---

## 3. JobGraph:优化层

### 3.1 创建入口

源码:`StreamingJobGraphGenerator#createJobGraph`

```scala
override def createJobGraph(): JobGraph = {
  // 1. 遍历 StreamGraph,合并 chainable 算子
  // 2. 生成 JobVertex(每个 chain = 一个 JobVertex)
  // 3. 生成 JobEdge(连接 JobVertex,带 IntermediateDataSet)
  // 4. 设置 ScheduleMode(EAGER / LAZY_FROM_SOURCES)
  // 5. 序列化算子到 JobGraph
}
```

### 3.2 Operator Chain(链化)

源码:`StreamingJobGraphGenerator#isChainable`

```
  Source → Map → Filter → KeyBy → Window → Reduce → Sink
  
  chainable: forward 边 + 同 slot 共享 + 同并行度
  → chain 结果:
    JobVertex1: Source + Map + Filter     (一个算子链)
    JobVertex2: KeyBy + Window + Reduce
    JobVertex3: Sink
```

`OperatorChain` 合并的好处:
- 减少网络 IO(算子间走函数调用,不走 Netty)。
- 减少线程切换。

代码示例:

```scala
env.disableOperatorChaining()  // 全局禁用 chain
someStream.startNewChain()      // 从此算子开始新 chain
someStream.disableChaining()    // 此算子单独成 chain
```

### 3.3 JobGraph 字段

```protobuf
message JobVertex {
  optional string id = 1;
  optional JobVertexID jobVertexId = 2;
  optional int32 parallelism = 3;
  optional int32 maxParallelism = 4;
  optional string operator_class = 5;
  optional bytes operator_bytes = 6;     // 序列化算子
  optional string name = 7;
  repeated InputConstraint inputs = 8;
}

message JobEdge {
  optional JobVertexID source = 1;
  optional JobVertexID target = 2;
  optional DistributionPattern distribution_pattern = 3;  // ALL_TO_ALL / POINTWISE
  optional bytes ship_strategy_bytes = 4;
}
```

### 3.4 ScheduleMode

源码:`ScheduleMode`

| 模式 | 含义 |
| --- | --- |
| `EAGER`(默认) | 所有节点同时调度 |
| `LAZY_FROM_SOURCES` | 从 Source 开始,前一个算子产生数据后才调度下游 |
| `LAZY_FROM_SOURCES_WITH_BATCH_SLOT_REQUEST` | 同上,Batch 模式 |

生产上 Batch / Auto-Batch 模式用 LAZY,流模式用 EAGER。

---

## 4. ExecutionGraph:运行时实例

### 4.1 创建入口

源码:`org.apache.flink.runtime.executiongraph.ExecutionGraphBuilder#buildGraph`

```scala
def buildGraph(...) {
  // 1. 为每个 JobVertex 创建 ExecutionJobVertex
  // 2. 为每个 IntermediateResult 创建 IntermediateResultPartition
  // 3. 创建 ExecutionVertex(parallelism 个)
  // 4. 调度 Execution 等待 Slot
}
```

### 4.2 ExecutionVertex 与并行度

```
   JobVertex (Map 算子,parallelism = 4)
       ├─ ExecutionJobVertex
       │     ├─ ExecutionVertex 0  ──  SubTask 0
       │     ├─ ExecutionVertex 1  ──  SubTask 1
       │     ├─ ExecutionVertex 2  ──  SubTask 2
       │     └─ ExecutionVertex 3  ──  SubTask 3
       └─ IntermediateResult (4 个 ResultPartition)
```

源码:`ExecutionVertex#scheduleForExecution`

```scala
def scheduleForExecution(slotProvider, locationPreference) {
  // 1. 向 SlotPool 申请 slot
  // 2. 申请到后,向 TM 提交 deploy(deployment)
  // 3. TM 收到 deploy,创建 Task 对象
  // 4. Task 启动,OperatorChain 初始化
}
```

### 4.3 Task 状态机

源码:`org.apache.flink.runtime.taskmanager.Task`

```
   CREATED  ───▶  DEPLOYING  ───▶  RUNNING  ───▶  FINISHED
                     │                            │
                     ▼                            ▼
                  FAILED                      CANCELING
                     │                            │
                     ▼                            ▼
                 RECONCILING                  CANCELED
```

### 4.4 IntermediateResult 与 ResultPartition

源码:`org.apache.flink.runtime.io.network.partition.ResultPartition`

每个 SubTask 输出 `ResultPartition`:
- `PIPELINED`:pipeline 模式,上游一直输出,下游一直消费(网络 buffer)。
- `BLOCKING`:批模式,上游完成才下发(批调度时用)。

---

## 5. 调度模型:Slot 共享

### 5.1 SlotSharing

源码:`org.apache.flink.runtime.jobmanager.scheduler.SlotSharingGroup`

Flink 默认一个 Slot 可以跑 **多个不同算子**的 SubTask,前提是它们在同一个 `SlotSharingGroup`。

```
   JobVertex1 (Source, parallelism=4)  ──┐
   JobVertex2 (Map, parallelism=4)     ──┤── 同一个 SlotSharingGroup
   JobVertex3 (Sink, parallelism=4)   ──┘
   
   → 集群分配 4 个 Slot,每个 Slot 跑 Source+Map+Sink 三个 SubTask
```

**关键源码**:`Scheduler#allocateSlot` + `SlotSharingGroup#resolveSharedSlot`

### 5.2 SlotSharingGroup 案例

```scala
val env = StreamExecutionEnvironment.getExecutionEnvironment
env.setParallelism(4)

val ssg = SlotSharingGroup.newBuilder("ssg1").build()

val source = ...
val mapped = source.map(...)
mapped.flatMap(...).slotSharingGroup("ssg2")  // 单独一组
```

### 5.3 与 Spark 对比

| 维度 | Flink | Spark |
| --- | --- | --- |
| 调度粒度 | Slot 共享 | Executor 内固定 slot |
| 算子并行度 | 各算子可不同 | RDD 内部 pipeline,各 stage 相同 |
| 资源粒度 | 1 内存 + CPU | Memory + vcore(YARN Container) |

---

## 6. TaskManager 与 Slot

### 6.1 TaskManager 启动

源码:`org.apache.flink.runtime.taskexecutor.TaskExecutor#start`

```
TaskManager 启动:
   ├─ ResourceManagerRegistration(注册到 RM)
   ├─ TaskExecutorService(接收 JobManager deploy task)
   ├─ SlotPool(管理本 TM 的 slots)
   ├─ NetworkEnvironment(Netty 服务,数据交换)
   ├─ TaskManagerServices(内存 / IO / 状态后端)
   └─ InternalOperatorChain 初始化
```

### 6.2 Slot 与内存

源码:`org.apache.flink.runtime.taskexecutor.slot.TaskSlotTable`

```
   TM 配置:
     taskmanager.numberOfTaskSlots = 4
     taskmanager.memory.process.size = 4096 MB
     taskmanager.memory.flink.size = 3072 MB
     taskmanager.memory.network.min = 64 MB
     taskmanager.memory.network.max = 1024 MB
     taskmanager.memory.managed.fraction = 0.4
```

Flink 内存模型(自 1.10+):

```
 ┌─────────────────── Process Memory (4096 MB) ──────────────────┐
 │                                                              │
 │  ┌─ JVM Heap (默认) ─┐  ┌─ Off-Heap (Direct / Native) ─┐    │
 │  │ Framework         │  │ Network buffers               │    │
 │  │ Task              │  │ RocksDB State Backend          │    │
 │  │ Network (部分)    │  │ (off-heap cache)              │    │
 │  │ Managed Memory    │  │                                │    │
 │  └──────────────────┘  └────────────────────────────────┘    │
 └──────────────────────────────────────────────────────────────┘
```

### 6.3 Managed Memory

源码:`MemoryManager`

- `taskmanager.memory.managed.fraction=0.4` — Managed 占 Flink Memory 比例。
- 用于 RocksDB、Sort-Merge Shuffle、Python 进程等。

---

## 7. MailBox 反压机制

### 7.1 反压的演进

| 版本 | 反压机制 |
| --- | --- |
| 1.5 之前 | TCP 反压(Netty 滑动窗口 + buffer pool) |
| 1.5+ | Credit-based 反压 + MailBox 单线程执行模型 |

### 7.2 Credit-Based 反压原理

源码:`org.apache.flink.runtime.io.network.partition.consumer.SingleInputGate#pollNext`

```
下游 TM:
   1. 申请 credit:申请 N 个 buffer 给上游
   2. 上游收到 credit 后,按 buffer 数量发送数据
   3. 下游消费 buffer 后,credit 释放,再申请
   4. 若上游 buffer 用完,blocking,自然反压
```

源码:`NettyBufferPool` + `RemoteInputChannel`。

### 7.3 MailBox 模型

源码:`org.apache.flink.streaming.runtime.tasks.MailboxProcessor`

```
   Task 线程 (单线程):
      │
      ▼
   ┌─ MailBox ──────┐
   │  PriorityQueue │  ◄── inputProcessor (record)
   │  - record      │  ◄── timerService (event time timer)
   │  - event       │  ◄── operator event (watermark, checkpoint barrier)
   │  - task event  │
   └────────────────┘
            │
            ▼ runMailboxStep
   OperatorChain.invokeOperator
```

**关键点**:Task 线程是单线程循环,每步处理一个 MailBox item,**避免加锁**,天然解决并发问题。

源码:`StreamTask#runMailboxLoop`:

```scala
while (isRunning) {
  mailboxProcessor.runMailboxStep()
}
```

### 7.4 MailBox 任务类型

| 任务类型 | 优先级 | 例子 |
| --- | --- | --- |
| `PROCESSING` | 最高 | 业务数据 |
| `EVENT` | 中 | Watermark / Checkpoint Barrier |
| `TASK_EVENT` | 低 | Operator Lifecycle 事件 |

源码:`MailboxProcessor#runSingleMail`。

---

## 8. Task 执行流程

源码:`org.apache.flink.streaming.runtime.tasks.StreamTask#invoke`

```scala
override def invoke() {
  // 1. init operator chain
  initOperatorChain()
  // 2. 状态初始化(初始化 / restore)
  stateInitializer.initializeState(...)
  // 3. 启动 Mailbox 循环
  mailboxProcessor.runMailboxLoop()
  // 4. cleanup
  cleanup()
}
```

每个 Operator 都有自己的 `processElement` / `processWatermark` / `snapshotState` 方法。

---

## 9. Checkpoint 调度与 Barrier

源码:`org.apache.flink.runtime.checkpoint.CheckpointCoordinator#triggerCheckpoint`

```
   1. JobManager 发起 Checkpoint trigger
   2. Inject barrier 到 Source 输入流
   3. barrier 沿 operator chain 流动
   4. 每个 operator 收到 barrier:
       - 缓存 barrier 前的所有数据
       - barrier 到达后触发 state snapshot
       - snapshot 完成后,转发 barrier 到下游
   5. Sink 收到所有上游 barrier 后,checkpoint 成功
```

源码:`CheckpointBarrierHandler` / `OperatorChain#broadcastEvent`。

### 9.1 Checkpoint 配置

```properties
state.backend=rocksdb
state.checkpoints.dir=hdfs:///flink/checkpoints
execution.checkpointing.interval=60s
execution.checkpointing.mode=EXACTLY_ONCE
execution.checkpointing.timeout=10min
execution.checkpointing.max-concurrent-checkpoints=1
execution.checkpointing.min-pause=0
state.backend.incremental=true
state.backend.rocksdb.localdir=/tmp/rocksdb
```

---

## 10. Flink 容错调度

### 10.1 Task 失败 → 重启策略

源码:`RestartStrategy`

| 策略 | 配置 | 适用 |
| --- | --- | --- |
| FixedDelayRestart | `fixed-delay` | 生产默认 |
| FailureRateRestart | `failure-rate` | 限制失败率 |
| ExponentialDelayRestart | `exponential-delay` | 渐进延迟 |
| NoRestart | `none` | 调试 |

### 10.2 固定延迟重启

```properties
restart-strategy=fixed-delay
restart-strategy.fixed-delay.attempts=3
restart-strategy.fixed-delay.delay=10s
```

### 10.3 状态恢复流程

源码:`Task#restoreState`

```
JobManager 触发重启:
   1. 取最新的 CheckpointState
   2. 给所有 SubTask 发送恢复请求 + State Handle
   3. Task 调用 restoreState 加载状态
   4. 重新订阅 Kafka offset(从 checkpoint 中保存的 offset 开始)
   5. 继续处理
```

---

## 11. 生产参数清单

`flink-conf.yaml`:

```yaml
# 基础
taskmanager.numberOfTaskSlots: 4
parallelism.default: 4

# 内存
taskmanager.memory.process.size: 4096m
taskmanager.memory.flink.size: 3072m
taskmanager.memory.network.min: 64m
taskmanager.memory.network.max: 1024m
taskmanager.memory.managed.fraction: 0.4

# Checkpoint
state.backend: rocksdb
state.checkpoints.dir: hdfs:///flink/checkpoints
state.backend.incremental: true
execution.checkpointing.interval: 60s
execution.checkpointing.mode: EXACTLY_ONCE
execution.checkpointing.timeout: 10min

# 重启
restart-strategy: fixed-delay
restart-strategy.fixed-delay.attempts: 3
restart-strategy.fixed-delay.delay: 10s

# 网络
taskmanager.network.memory.fraction: 0.1
taskmanager.network.buffer-per-gate: 8

# Runtime
execution.runtime-mode: STREAMING
pipeline.operator-chaining.enabled: true
```

---

## 12. 生产实战任务

### 12.1 任务一:Flink 简单流作业

```scala
// code/flink/wordcount.scala
import org.apache.flink.streaming.api.scala._
import org.apache.flink.streaming.api.windowing.time.Time

object WordCount {
  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    env.setParallelism(2)

    val text = env.socketTextStream("localhost", 9999)
    val counts = text.flatMap(_.split("\\s+"))
      .filter(_.nonEmpty)
      .map((_, 1))
      .keyBy(0)
      .timeWindow(Time.seconds(5))
      .sum(1)

    counts.print()
    env.execute("Flink WordCount")
  }
}
```

### 12.2 任务二:Operator Chain 控制

```scala
val source = env.addSource(...)
val map1 = source.map(...)        // 与 source chain
val map2 = map1.startNewChain().map(...)  // 新 chain
val map3 = map2.disableChaining().map(...)  // 单独 chain
```

### 12.3 任务三:Kafka Source + 自定义 Partitioning

```scala
import org.apache.flink.streaming.connectors.kafka._
import org.apache.flink.streaming.util.serialization.SimpleStringSchema

val kafkaProps = new Properties()
kafkaProps.setProperty("bootstrap.servers", "kafka:9092")
kafkaProps.setProperty("group.id", "flink-consumer")

val stream = env.addSource(new FlinkKafkaConsumer[String]("topic", new SimpleStringSchema(), kafkaProps))
  .setParallelism(4)
  .map { x => x.toUpperCase }
  .keyBy(_.hashCode % 16)
  .window(TumblingEventTimeWindows.of(Time.minutes(5)))
  .reduce((a, b) => a + b)
  .addSink(new FlinkKafkaProducer[String]("out", new SimpleStringSchema(), kafkaProps))

env.execute()
```

### 12.4 任务四:TaskManager 内存调优

```bash
# bin/taskmanager.sh
export FLINK_TM_HEAP=4096
# OR flink-conf.yaml
taskmanager.memory.process.size=4096m
taskmanager.memory.flink.size=3072m
```

### 12.5 任务五:Web UI 观察 JobGraph

```bash
# 启动 Flink 集群
bin/start-cluster.sh

# 提交 job
bin/flink run -c com.bigdata.WordCount \
  --classpath file:///opt/jars/* \
  ./my-job.jar
```

打开 `http://jobmanager:8081`,看:
- **Running Jobs**:JobGraph 可视化。
- **SubTask 时间线**:Task 各阶段耗时。
- **Checkpoint**:成功/失败计数。
- **Backpressure**:每个 SubTask 的反压状态。

---

## 13. 专家面试题

1. **Flink 三层图的区别?**
   *要点*:StreamGraph(用户 API)→ JobGraph(优化 + chain)→ ExecutionGraph(并行实例 + 调度)。
2. **Operator Chain 的规则?**
   *要点*:forward 边 + 同 SlotSharingGroup + 同并行度。源码 `StreamingJobGraphGenerator#isChainable`。
3. **SlotSharingGroup 的意义?**
   *要点*:让一个 Slot 跑多个不同算子的 SubTask,减少总 Slot 数,提高资源利用率。
4. **MailBox 模型为什么用单线程?**
   *要点*:避免算子加锁,通过优先级队列(Processing/Event/Task Event)保证事件顺序,简化并发。
5. **Credit-Based 反压如何工作?**
   *要点*:下游申请 credit,上游按 credit 发送 buffer,无 credit 时阻塞,自然反压。Netty buffer pool 复用。
6. **Checkpoint barrier 怎么流动?**
   *要点*:沿 operator chain 广播,每个算子收到所有上游 barrier 后,触发 snapshot + 转发 barrier。
7. **Flink 与 Spark 的 ExecutionGraph 对比?**
   *要点*:Spark 只有一层 DAG(Stage 内 pipeline + Stage 间 shuffle),Flink 三层图 + chain + slot sharing 更精细。
8. **TumblingEventTimeWindows vs ProcessingTimeWindows?**
   *要点*:EventTime 用数据自带时间戳(需 Watermark),ProcessingTime 用 wall clock。
9. **TaskManager 的 Network buffer 用途?**
   *要点*:Netty buffer + shuffle buffer,网络传输数据。`taskmanager.memory.network.fraction=0.1`。
10. **Flink 的 EAGER vs LAZY_FROM_SOURCES 调度?**
    *要点*:EAGER(流默认)所有顶点同时调度;LAZY_FROM_SOURCES(批)从 Source 开始按需调度,节省资源。
11. **PIPELINED vs BLOCKING 边模式?**
    *要点*:PIPELINED 上游不下发到下游,逐条 record;BLOCKING 上游完成后批量下发(批模式)。
12. **Flink 的"流批一体"如何实现?**
    *要点*:`RuntimeMode` 切换(`STREAMING` / `BATCH`),批模式开启 LAZY 调度 + BLOCKING 边 + Sort-Merge Shuffle。

---

## 14. 一张图回顾 Flink 三层图

```
   User API (StreamExecutionEnvironment.execute)
       │
       ▼ StreamingJobGraphGenerator#createJobGraph
   StreamGraph (StreamNode + StreamEdge)
       │
       ▼ Operator Chain 优化
   JobGraph (JobVertex + JobEdge + IntermediateDataSet)
       │
       ▼ ExecutionGraphBuilder#buildGraph(并行度展开)
   ExecutionGraph (ExecutionJobVertex + ExecutionVertex + IntermediateResult)
       │
       ▼ Scheduler#allocateSlot → TaskManager
   运行时 Task (OperatorChain + MailBox + Netty)
```

---

## 15. 小结与下一章预告

- Flink 调度 = StreamGraph(API) + JobGraph(优化) + ExecutionGraph(运行时) 三层图。
- SlotSharing + Operator Chain 是 Flink 资源利用率的精髓。
- MailBox + Credit-Based 反压是 Flink 真流式的核心。
- 下一章 [07-Flink 状态、Checkpoint、Exactly-Once],我们进入 Flink 最难也最有价值的话题:KeyedState / OperatorState、RocksDB 后端、Savepoint vs Checkpoint、Flink CDC 流程。