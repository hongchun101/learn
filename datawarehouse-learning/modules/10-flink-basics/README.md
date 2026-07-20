# 10-Flink-basics：Flink 流处理基础

本模块是数据仓库课程的实时计算起点。Apache Flink 是一个面向分布式、高可用、状态化的流处理框架。它把"事件流"视为"一等公民"，把"批"视为"有界流的特例"。学完本章，你应该能够理解：

- Flink 的分层架构与角色分工（Client / JobManager / TaskManager）
- DataStream API 的事件时间（Event Time）与水位线（Watermark）语义
- 四类窗口：滚动（Tumbling）、滑动（Sliding）、会话（Session）、全局（Global）
- 状态、Checkpoint、Savepoint 三者的区别与协作
- 状态后端（State Backend）的内存、文件系统、RocksDB 三种实现
- 会话模式、Per-Job 模式、应用模式的部署差异与选择策略

本模块只用 Python 模拟 Flink 的核心算子，不需要部署真实的 Flink 集群，所有 Demo 都可以通过 `pytest` 在本地运行、验证、可视化。

---

## ch01 Flink 架构

Flink 的运行时（Runtime）由两类进程构成：

- **JobManager（JM）**：协调者，负责接收用户提交的 JobGraph、向 TaskManager 调度算子（Operator）、协调 Checkpoint、协调故障恢复。它等价于 Spark 的 Driver + Cluster Manager 的组合。
- **TaskManager（TM）**：执行者，每个 TaskManager 上有若干 Task Slot，每个 Slot 只能运行一个 Operator 的并行实例。Task 之间的数据传递通过 Netty 的网络 buffer 完成。

JobManager 内部包含三个关键组件：

1. **Dispatcher**：对外暴露 REST / CLI 接口，接收 Job 提交后启动 JobMaster。
2. **JobMaster**：负责单个 Job 的执行，管理算子的调度与重启。
3. **ResourceManager**：负责 TaskManager 的资源申请与释放，在 K8s 部署中直接对接 Resource Manager。

TaskManager 中的关键对象：

- **Task**：一个算子的并行实例，例如 `Filter` 在并行度 4 时有 4 个 Task。
- **Operator Chain**：若干算子串成一条链，链内不经过序列化/反序列化，极大降低网络开销。
- **Task Slot**：物理资源隔离单位，一个 Slot 容纳一条完整 Operator Chain 的子链。

部署模式：

- **Session Mode**：预先启动一个集群，多个 Job 共享；隔离性弱、资源利用率高，Demo/开发常用。
- **Per-Job Mode**：每个 Job 单独启动集群；隔离性强、资源利用率低，生产逐渐被 K8s 替代。
- **Application Mode**：每个 Application 独占 JM，但 TM 共享；当前 K8s 上推荐的部署形态。

---

## ch02 DataStream API

DataStream API 是 Flink 的核心"过程式"编程接口，对应 `DataStream / KeyedStream / WindowedStream / DataStreamSink` 四类抽象。

### 编程骨架

```java
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
env.setParallelism(2);
env.setStreamTimeCharacteristic(TimeCharacteristic.EventTime);

DataStream<Event> stream = env
    .addSource(new KafkaSource<>(...))
    .assignTimestampsAndWatermarks(
        WatermarkStrategy.<Event>forBoundedOutOfOrderness(Duration.ofSeconds(5))
            .withTimestampAssigner((e, ts) -> e.getEventTime())
    )
    .filter(e -> e.isValid())
    .keyBy(Event::getUserId)
    .window(TumblingEventTimeWindows.of(Time.minutes(1)))
    .aggregate(new CountAgg(), new WindowResult());

stream.addSink(new PrintSink()).name("print-sink");
env.execute("MyJob");
```

### 算子家族

- **Transformations**：`map / filter / flatMap / keyBy / reduce / aggregate / process / union / join / coGroup / iterate`
- **Physical Partitioning**：`shuffle / rebalance / broadcast / forward / global / partitionCustom`
- **Source / Sink**：内置 Kafka、File、Pulsar、Socket、JDBC 等

### ProcessFunction 的"特权"

只有 `ProcessFunction` 与 `KeyedProcessFunction` 可以访问"时间服务"（`TimerService`）：

- `ctx.timerService().registerEventTimeTimer(ts)`：注册事件时间定时器。
- `ctx.timerService().registerProcessingTimeTimer(ts)`：注册处理时间定时器。
- `onTimer(...)`：定时器触发时的回调，可在此更新侧输出流（Side Output）。

这也意味着 ProcessFunction 是 Flink 实时数仓里"复杂状态 + 时间驱动"逻辑的落脚点，例如维表关联的 TTL 清理、CEP 的状态更新等。

---

## ch03 Watermark（水位线）

事件时间（Event Time）= 业务本身记录的时间戳；处理时间（Processing Time）= 计算节点上的本地时钟。Flink 默认采用事件时间，因为它对数据乱序与回追是可控的。

**Watermark = "时间戳 ≤ X 的事件不会再到达"** 的承诺。算子收到 Watermark 后才认为 X 之前的窗口已经"齐了"，可以触发计算。

### 水位线生成

```java
WatermarkStrategy
    .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(5))
    .withTimestampAssigner((e, ts) -> e.getEventTime());
```

周期性水位线（每 N ms 检查一次当前最大事件时间戳 - `maxOutOfOrderness`）是最常用的策略。

### 迟到事件

即使有了水位线，仍可能迟到。Flink 通过两种机制吸收迟到：

1. **allowedLateness**：允许窗口在第一次触发后再保留一段时间；迟到的事件会再次触发窗口计算。
2. **sideOutputLateData**：把迟到事件路由到侧输出流，由用户决定追加或丢弃。

### 周期性水位线的源码骨架

```java
public void onEvent(Event event, long eventTimestamp, WatermarkOutput out) {
    maxTimestamp = Math.max(maxTimestamp, eventTimestamp);
}
public void onPeriodicEmit(WatermarkOutput out) {
    out.emitWatermark(new Watermark(maxTimestamp - maxOutOfOrderness - 1));
}
```

---

## ch04 Window（窗口）

Flink 的窗口模型 = **Window Assigner + Trigger + Evictor + Function**。

### 窗口类型

- **Tumbling Window**：固定大小、不重叠。`[0, 5s), [5s, 10s)` 严格分段。
- **Sliding Window**：大小与步长分开，可重叠。`size=10s, slide=5s` 表示每 5s 出发一个 10s 长的窗口。
- **Session Window**：按数据动态合并，超过 gap 才断开。`gap=10s` 时相邻 9s 的两段会被合并。
- **Global Window**：所有事件落入同一个窗口，需要自定义 Trigger 才能触发。

### Trigger 与 Evictor

- **Trigger** 决定窗口何时触发：`onElement / onEventTime / onProcessingTime / onMerge / clear`。
- **Evictor** 在窗口触发前过滤元素（`evictBefore / evictAfter`），常用于"先聚合再剔除过大元素"等场景。

### 增量聚合 vs 全量聚合

- **ReduceFunction / AggregateFunction**：增量，逐元素更新窗口状态。
- **ProcessWindowFunction**：全量，窗口触发时拿到 `Iterable<Element>` 再计算（推荐外接 MapState / Database 做"丰富"）。

---

## ch05 Checkpoint（检查点）

Checkpoint 是 Flink 容错的灵魂。

### 算法

Flink 实现了 Chandy-Lamport 风格的 **Asynchronous Barrier Snapshotting (ABS)**：

1. JM 周期性向所有 Source Task 注入 Barrier（特殊的标记事件）。
2. Barrier 沿算子链向下游流动；下游算子对每个输入通道（channel）都收到 Barrier 后才对齐快照。
3. 对齐阶段会把当前 in-flight 的 buffer 缓存起来，让 Barrier 之外的记录都处理完后才输出，保证快照的一致性。

### 与 State 协作

Checkpoint 真正持久化的不是"算子的实例对象"，而是 **StateBackend** 提供的状态副本（KeyedState / OperatorState）。Checkpoint 写入外部持久化系统后故障时由 JobMaster 从最近一次成功的 Checkpoint 恢复。

### 配置关键点

```yaml
execution.checkpointing.interval: 60s
execution.checkpointing.mode: EXACTLY_ONCE
execution.checkpointing.timeout: 10min
state.checkpoints.num-retained: 5
```

EXACTLY_ONCE ≠ 每个记录只被消费一次，而是 **每个记录只被"算子状态效果"应用一次**。Source 必须能"重放"才能在故障恢复时重新消费（Kafka Source 通过偏移量 + 事务性 Sink 实现）。

---

## ch06 Savepoint（保存点）

Savepoint 是 Checkpoint 的"可移植版"——同样是状态快照，但它是 **手动触发、显式启动与运维工具协作** 的。

### 区别

| 维度 | Checkpoint | Savepoint |
| --- | --- | --- |
| 触发 | 周期自动 | 命令显式 |
| 用途 | 故障恢复 | 状态兼容、版本升级、流量切换、A/B 实验 |
| 文件结构 | `_metadata` + `state` 子目录 | 同一格式但独立编号 |
| 兼容性 | 内部 Rpc 用 | 跨版本兼容（State Schema 由 `AvroStateSerializer` 守护） |

### 典型用法

```bash
flink savepoint <jobId> [path]      # 产生 Savepoint
flink cancel <jobId> -s <path>      # 从 Savepoint 取消
flink modify <jobId> -s <path>      # 修改并行度等
```

升级 Operator 状态结构时，建议同时运行两个版本，对比一段时间的输出，再切换流量。

---

## ch07 状态后端（State Backend）

State Backend 决定了：

- **状态存在哪里**：内存、JVM Heap、堆外、RocksDB
- **快照如何生成**：同步（同步到 TM 本地）+ 异步（上传到 HDFS）

### 三大实现

| 后端 | 状态位置 | 快照 | 适用 |
| --- | --- | --- | --- |
| **MemoryStateBackend** | TM JVM Heap | 仅 TM 本地 | 本地调试 |
| **FsStateBackend** | TM Heap | 远程 HDFS/S3 | 小状态 + 大集群 |
| **RocksDBStateBackend** | RocksDB（堆外/磁盘） | 增量 + 全量远程 | 大状态（> TB） |

RocksDB 通过 LSM 树把写入的 key 落到磁盘，Checkpoint 时可以只上传变化的增量（incremental checkpoint）极大提升 TB 级状态的可恢复性。代价是访问延迟更高，每次 get/put 要经过 RocksDB 接口。

### 选择口诀

- 状态 < 1 GB：FsStateBackend。
- 状态 >= 1 GB 或 TTL 长：RocksDBStateBackend（增量 Checkpoint）。
- 状态只是"临时计算缓冲"：MemoryStateBackend（仅调试）。

---

## ch08 部署模式与生产最佳实践

### 部署三大模式

- **Session**：JM 复用，多 Job 混部。Dev/Tester 友好。
- **Per-Job**：JM/TM 一对一，启动慢但隔离好。传统 YARN 用法。
- **Application**：JM 独享 Application，TM 跨 Application 共享。K8s 上 FLink 推荐的官方模式，Flink 1.13+ 默认推荐。

### K8s 上的 Flink

Flink 1.13 后的 Native Kubernetes 集成使用 `kubernetes-session` 与 `kubernetes-application` 两个部署模式：

```yaml
apiVersion: flink.apache.org/v1beta1
kind: FlinkDeployment
metadata:
  name: basic-example
spec:
  image: flink:1.18
  flinkVersion: v1_18
  mode: native
  ... 
```

Flink 1.18 还把"在 K8s 上跑大型 Application + 大量 Savepoint + 滚动升级"打磨到了近乎银弹，单 Application 可能跑几千个 TM。

### 反模式与生产要点

1. **永远开启 Checkpoint + 至少一次或恰好一次语义**。
2. **背压监控**：Flink 自带反压指标 `flink_taskmanager_job_task_isBackPressured`；背压持续升高意味着下游 Sink 慢，需要扩容 Sink 并行度或升级其吞吐。
3. **状态 TTL**：所有 KeyedState 必须配置 TTL，否则状态只会增长、Checkpoint 越来越大、恢复越来越慢。
4. **避免大对象**：单 Key 的 Value 不应超过几 MB；超大对象请落到外部 KV（Redis、HBase、Paimon）而不是放进 Flink State。
5. **合理自定义序列化器**：Flink 默认 Kryo，但 Kryo 对 POJO 不友好。建议实现 `TypeInformation` 与 `TypeSerializer` 自己管。

### 作业的开发到上线

```
DataStream (本地) → 单元测试 → Integration  →  MiniCluster → K8s Session → K8s Application
```

每一个阶段都是层级隔离的：在 K8s 上跑的 Job 应该已经在 MiniCluster 验证过反压、Checkpoint、Savepoint。强烈建议将 Sink 设为 **Kafka + 可重放 DB 事务** 或者 **Paimon / Iceberg / Hudi** 的 Exactly-Once 协议，使端到端恰好一次。

---

## 本模块 Demo 速览

- `src/flink_stream_demo.py`：纯 Python 实现 Watermarks、三类 Window、Late Event 处理。
- `tests/test_flink.py`：4 个测试分别覆盖滚动、滑动、会话、水位线 + 迟到吸收。
- 运行：`cd datawarehouse-learning && python -m pytest modules/10-flink-basics/tests/ -v`

学完本章，你应当能独立读懂 Flink Job 的 DAG，能在水位线、状态、Checkpoint 三大支柱上识别并解决实时数仓的常见故障，为后续 Flink SQL / CDC 与实时仓库分层打下基础。
