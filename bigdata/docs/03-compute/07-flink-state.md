# 07. Flink 状态、Checkpoint、Exactly-Once

> **本章定位**:Flink 真正能落地的根本原因是 **状态管理 + Exactly-Once**。本章深入 KeyedState / OperatorState、RocksDB 状态后端、Savepoint vs Checkpoint 区别、Flink CDC 流程、状态 TTL,所有源码均指向 Apache Flink 1.18+。

---

## 1. Flink 状态总览

### 1.1 状态的分类

```
                  ┌─────────────────────────┐
                  │       Flink State        │
                  ├────────────┬────────────┤
                  │ KeyedState │OperatorState│
                  ├────────────┼────────────┤
                  │  按 key 分 │  按 SubTask │
                  │            │            │
                  ├────────────┴────────────┤
                  │     Raw State           │
                  │ (用户自管理,Tuple2 等)  │
                  └─────────────────────────┘
```

### 1.2 KeyedState vs OperatorState

| 维度 | KeyedState | OperatorState |
| --- | --- | --- |
| 作用域 | key(每个 key 一份) | SubTask(整个 SubTask 一份) |
| 典型算子 | keyed stream | Kafka Connector / Source Function |
| 并行度变化 | 自动 rebalance | 手动 rebalance(Union / Round-robin / Broadcast) |
| 实现 | RocksDB / Memory | List / UnionList / Broadcast |

源码:
- `org.apache.flink.api.common.state.State`
- `org.apache.flink.api.common.state.ValueState`
- `org.apache.flink.api.common.state.ListState`
- `org.apache.flink.api.common.state.MapState`
- `org.apache.flink.streaming.api.operators.KeyedStateBackend`

---

## 2. KeyedState 详解

### 2.1 ValueState

```scala
class MyKeyedState extends KeyedProcessFunction[String, String, String] {
  @transient private var counterState: ValueState[Long] = _

  override def open(parameters: Configuration): Unit = {
    val stateDescriptor = new ValueStateDescriptor[Long](
      "counter", classOf[Long], 0L
    )
    counterState = getRuntimeContext.getState(stateDescriptor)
  }

  override def processElement(value: String, ctx: Context, out: Collector[String]): Unit = {
    val current = counterState.value()
    counterState.update(current + 1)
    out.collect(s"$value-count=$current")
  }
}
```

源码:`ValueState` 接口 + `ValueStateDescriptor`。

### 2.2 ListState

```scala
val listDescriptor = new ListStateDescriptor[String]("recentEvents", classOf[String])
val listState = getRuntimeContext.getListState(listDescriptor)

// 添加
listState.add(event)
// 全部读出
listState.get().forEach(...)
// 清空
listState.clear()
```

### 2.3 MapState

```scala
val mapDescriptor = new MapStateDescriptor[String, Long]("userCount", classOf[String], classOf[Long])
val mapState = getRuntimeContext.getMapState(mapDescriptor)

mapState.put("alice", 100)
val count = mapState.get("alice")
mapState.contains("alice")
```

### 2.4 ReducingState / AggregatingState

```scala
// ReducingState:增量的 reduce
val rsDescriptor = new ReducingStateDescriptor[Long]("count", new ReduceFunction[Long] {
  override def reduce(v1: Long, v2: Long): Long = v1 + v2
}, classOf[Long])
```

### 2.5 TTL(Time-To-Live)

源码:`org.apache.flink.api.common.state.StateTtlConfig`

```scala
val ttlConfig = StateTtlConfig.newBuilder(Time.hours(24))
  .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)
  .setStateVisibility(StateTtlConfig.StateVisibility.NeverReturnExpired)
  .cleanupFullSnapshot()
  .build()

val descriptor = new ValueStateDescriptor[Long]("count", classOf[Long])
descriptor.enableTimeToLive(ttlConfig)
```

**TTL 清理策略**:
- `cleanupFullSnapshot`:每次全量 snapshot 时清理(默认)。
- `cleanupIncrementally`:后台线程增量清理(每访问 N 次触发一次)。
- `cleanupInRocksDBCompactFilter`:RocksDB 后端专用,在 LSM 合并时清理。

源码:`org.apache.flink.runtime.state.ttl.TtlStateFactory`。

---

## 3. OperatorState 详解

### 3.1 Source Function 的 OperatorState

Flink Kafka Connector 用 `OperatorState` 记录 Kafka offset:

源码:`org.apache.flink.streaming.connectors.kafka.FlinkKafkaConsumerBase#initializeState`

```scala
public abstract class FlinkKafkaConsumerBase<T> extends RichParallelSourceFunction<T>
    implements CheckpointedFunction {
  
  private transient ListState<TopicPartition> unionOffsetState;
  
  @Override
  public void initializeState(FunctionInitializationContext context) {
    // 从 checkpoint 恢复 offset
    unionOffsetState = context.getOperatorStateStore().getListState(
        new ListStateDescriptor<>("kafka-offsets", TypeInformation.of(new TypeHint<TopicPartition>() {}))
    );
    if (context.isRestored()) {
      for (TopicPartition tp : unionOffsetState.get()) {
        // restore offset
      }
    }
  }
  
  @Override
  public void snapshotState(FunctionSnapshotContext context) {
    // 保存当前 offset
    unionOffsetState.clear();
    for (TopicPartition tp : currentOffsets.keySet()) {
      unionOffsetState.add(tp);
    }
  }
}
```

### 3.2 CheckpointedFunction 接口

源码:`org.apache.flink.streaming.api.checkpoint.CheckpointedFunction`

```scala
public interface CheckpointedFunction {
  void snapshotState(FunctionSnapshotContext context) throws Exception;
  void initializeState(FunctionInitializationContext context) throws Exception;
}
```

**调用时机**:
- `initializeState`:Operator 初始化时(创建 + restore)。
- `snapshotState`:每次 checkpoint 前调用。

### 3.3 状态再分配

并行度变化时,OperatorState 重新分配:

```scala
public abstract class OperatorStateStore {
  // 1. ListState:每个 SubTask 一份 list,union 后 rebalance
  ListState<T> getListState(ListStateDescriptor<T> stateDescriptor);
  
  // 2. UnionListState:union 后每个 SubTask 拿到所有数据
  //    (适合 Source 记录 offset 等全局信息)
  <T> UnionListState<T> getUnionListState(...);
  
  // 3. BroadcastState:广播给所有 SubTask(相同)
  <K, V> BroadcastState<K, V> getBroadcastState(...);
}
```

源码:`org.apache.flink.runtime.state.DefaultOperatorStateBackend`。

---

## 4. RocksDB 状态后端

### 4.1 内存 vs RocksDB

| 维度 | MemoryStateBackend | FsStateBackend | RocksDBStateBackend |
| --- | --- | --- | --- |
| 存储 | JVM Heap | 堆 + 本地文件 / HDFS | RocksDB(堆外 LSM) |
| 容量限制 | GB 级 | TB | TB(单节点无上限) |
| 性能 | 极快 | 中等 | 中等(随机读略慢) |
| 推荐场景 | 小状态 / 测试 | 中等状态 | 大状态(GB-TB) |

### 4.2 RocksDB 集成

源码:`org.apache.flink.contrib.streaming.state.RocksDBStateBackend`

```yaml
state.backend: rocksdb
state.backend.incremental: true   # ★ 增量 checkpoint
state.backend.rocksdb.localdir: /tmp/rocksdb,/data1/rocksdb,/data2/rocksdb
state.checkpoints.dir: hdfs:///flink/checkpoints
```

### 4.3 增量 Checkpoint(Incremental Checkpoint)

源码:`RocksDBIncrementalCheckpoint`

```
全量 checkpoint:
   1. 拷贝所有 sst 文件 → HDFS   (几十 GB)

增量 checkpoint:
   1. 只上传新写入/修改的 sst 文件 → HDFS
   2. 上传新 memtable 的 WAL → HDFS
   3. restore 时 merge 所有增量 sst
```

**收益**:checkpoint 时间从分钟级降到秒级,HDFS 上传数据量减少 90%+。

### 4.4 RocksDB 调优

源码:`org.apache.flink.contrib.streaming.state.RocksDBConfigurableOptions`

```yaml
# 内存
state.backend.rocksdb.memory.managed: true
state.backend.rocksdb.memory.write-buffer-ratio: 0.5

# Block Cache
state.backend.rocksdb.block.cache-size: 256 MB

# 压缩
state.backend.rocksdb.compression: lz4
state.backend.rocksdb.compression.per.level: [none, none, lz4, lz4, lz4, zstd, zstd]

# Compaction
state.backend.rocksdb.compaction.style: universal
state.backend.rocksdb.write-buffer.size: 64 MB
state.backend.rocksdb.max-write-buffer-number: 4
```

**核心权衡**:
- 内存大:吞吐高,但单个 TM 受限于机器内存。
- 压缩:减少磁盘 IO,增加 CPU 占用。
- Compaction:后台线程合并 SST,影响写入延迟。

---

## 5. Checkpoint 原理

### 5.1 分布式快照算法(Chandy-Lamport)

```
   JobManager 发起 checkpoint:
       │
       ▼
   Source Inject barrier 到输入流
       │
       ▼
   Operator A 收到 barrier:
       ├─ 缓存 barrier 前所有数据
       ├─ 触发状态 snapshot
       ├─ snapshot 完成后,转发 barrier
       │
       ▼
   Operator B 收到 barrier (来自多个上游):
       ├─ 缓存所有输入
       ├─ barrier 对齐(Align)
       ├─ snapshot state
       ├─ 转发 barrier
       │
       ▼
   Sink 收到所有上游 barrier:
       ├─ 触发自己的 snapshot
       ├─ ack JobManager
       │
       ▼
   JobManager 收齐所有 ack,checkpoint 成功
```

源码:`CheckpointBarrierHandler` / `OperatorChain#broadcastEvent`。

### 5.2 Barrier 对齐

源码:`BarrierBuffer#processBarrier`

```scala
override def processBarrier(channel: InputChannelInfo, barrier: CheckpointBarrier) {
  if (currentCheckpointId < barrier.getId) {
    if (bufferedBarriers.size() == 0) {
      // 第一个 barrier,触发 checkpoint
      currentCheckpointId = barrier.getId
      // 阻塞其他 channel(对齐)
    }
    bufferedBarriers.add(barrier)
    if (bufferedBarriers.size() == totalChannels) {
      // 所有 channel 都到齐,触发 snapshot
      channel.markAligned()
      notifyCheckpoint(barrier.getId)
      bufferedBarriers.clear()
    }
  }
}
```

### 5.3 At-Least-Once vs Exactly-Once

| 模式 | 行为 | 适用 |
| --- | --- | --- |
| At-Least-Once | 不对齐 barrier,Checkpoint 完成后未对齐的数据重复处理 | 数据可重复 + sink 幂等 |
| Exactly-Once(默认) | 对齐 barrier,等待所有上游到齐再 snapshot | 大多数流场景 |

配置:`execution.checkpointing.mode=EXACTLY_ONCE | AT_LEAST_ONCE`

源码:`org.apache.flink.streaming.api.CheckpointingMode`。

---

## 6. Savepoint vs Checkpoint

### 6.1 区别

| 维度 | Checkpoint | Savepoint |
| --- | --- | --- |
| 触发 | JobManager 自动周期 | 用户手动 |
| 目的 | 容错 | 部署、版本升级、并行度调整 |
| 存储 | 配置的 state backend | 用户指定路径 |
| 保留策略 | 自动清理(externalized 配置下保留) | 永不过期,用户管理 |
| 触发命令 | JobManager 自动 | `bin/flink savepoint <jobId>` |

### 6.2 Savepoint 使用场景

源码:`org.apache.flink.runtime.state.Savepoint`

```bash
# 1. 触发 savepoint
bin/flink savepoint <jobId> hdfs:///flink/savepoints

# 2. 修改并行度或代码后从 savepoint 启动
bin/flink run -s hdfs:///flink/savepoints/savepoint-xxx \
  --parallelism 8 \
  -c com.bigdata.MyJob \
  ./my-job.jar
```

### 6.3 Savepoint 格式

源码:`Savepoint#storeAsDirectory`

```
hdfs:///flink/savepoints/savepoint-xxx/
   ├── _metadata            # metadata(算子 ID + state handle)
   ├── 0/                    # SubTask 0
   │   ├── state-0001
   │   └── state-0002
   ├── 1/
   │   └── ...
   └── 2/
```

---

## 7. Flink CDC(Change Data Capture)

### 7.1 CDC 流程

```
   MySQL/PostgreSQL binlog/WAL
       │
       ▼ Debezium / Flink CDC Source
   Flink Job
       │
       ├─ Debezium Source(读 binlog)
       ├─ 状态(已处理 offset)
       ├─ 转换 / Join / Aggregate
       │
       ▼ Sink
   Kafka / Doris / Iceberg / Hudi
```

### 7.2 Flink CDC 源码

源码:`org.apache.flink.cdc.connectors.mysql.source.MySqlSource`

```scala
public class MySqlSource<T> implements Source<T, ..., ...> {
  private final DebeziumSourceFunction<...> debeziumSourceFunction;
  private final DebeziumDeserializationSchema<T> deserializer;
}

// 配置
MySqlSource.<String>builder()
  .hostname("mysql-host")
  .port(3306)
  .databaseList("mydb")
  .tableList("mydb.orders")
  .username("root")
  .password("password")
  .deserializer(new JsonDebeziumDeserializationSchema())
  .startupOptions(StartupOptions.initial())
  .build()
```

### 7.3 Flink CDC 关键流程

```
1. 全量阶段(Snapshot Phase):
   - MySQL 一致性读 + 全量 binlog offset 记录
   - 一块块 chunk 读取
   - 状态:chunk 进度

2. 增量阶段(Binlog Phase):
   - 从全量结束时的 binlog offset 开始读
   - 解析 binlog → Debezium → Flink event
   - 与全量数据 union

3. checkpoint:
   - 全量阶段保存 chunk 进度
   - 增量阶段保存 binlog offset
```

### 7.4 CDC 生产参数

```yaml
# Debezium
debezium.snapshot.mode: initial
debezium.snapshot.locking.mode: none
debezium.max.batch.size: 2048
debezium.max.queue.size: 8192

# Flink CDC
state.backend: rocksdb
execution.checkpointing.interval: 60s
```

---

## 8. 状态查询与可观测

### 8.1 Queryable State

源码:`org.apache.flink.queryablestate.client.QueryableStateClient`

```scala
val client = new QueryableStateClient("jm-host", 9069)
val future = client.getKvState(
  jobId, "my-state", "alice", BasicTypeInfo.STRING_TYPE_INFO, kvStateDescriptor
)
val result = future.get()
```

### 8.2 Metrics

源码:`org.apache.flink.metrics.Metric`

```scala
class MyKeyedProcess extends KeyedProcessFunction[String, String, String] {
  override def open(parameters: Configuration): Unit = {
    val counter = getRuntimeContext.getMetricGroup.counter("my-counter")
    counter.inc()
  }
}
```

常用 metric:
- `numRecordsIn / numRecordsOut`:输入/输出速率。
- `latencyMarker`:事件时间延迟。
- `currentSendTimeLag`(Kafka Sink):发送延迟。

---

## 9. 状态 Schema 演进

### 9.1 状态迁移

源码:`org.apache.flink.api.common.state.ValueStateDescriptor`

```scala
// v1
val descriptor = new ValueStateDescriptor[Long]("count", classOf[Long])

// v2:新增字段
val descriptorV2 = new ValueStateDescriptor[UserInfo]("user", classOf[UserInfo])

// State migration
class StateMigration implements StateMigrationFunction[Long, UserInfo] {
  override def migrate(legacy: Long): UserInfo = UserInfo(legacy, "")
}
```

### 9.2 生产经验

- **永远不要删除已有 state**,会丢数据。
- **新增字段**:用 Avro / Protobuf 支持默认值。
- **类型变化**:显式 StateMigration 函数。

---

## 10. 生产参数清单

`flink-conf.yaml`:

```yaml
# Checkpoint
state.backend: rocksdb
state.backend.incremental: true
state.checkpoints.dir: hdfs:///flink/checkpoints
execution.checkpointing.interval: 60s
execution.checkpointing.mode: EXACTLY_ONCE
execution.checkpointing.timeout: 10min
execution.checkpointing.max-concurrent-checkpoints: 1

# Restart
restart-strategy: fixed-delay
restart-strategy.fixed-delay.attempts: 3
restart-strategy.fixed-delay.delay: 10s

# RocksDB
state.backend.rocksdb.memory.managed: true
state.backend.rocksdb.memory.write-buffer-ratio: 0.5
state.backend.rocksdb.block.cache-size: 256 MB
state.backend.rocksdb.compression: lz4
state.backend.rocksdb.localdir: /data1/rocksdb,/data2/rocksdb

# 内存
taskmanager.memory.process.size: 6144m
taskmanager.memory.flink.size: 4608m
taskmanager.memory.managed.fraction: 0.4

# 网络
taskmanager.network.memory.fraction: 0.1
taskmanager.network.buffer-per-gate: 8

# TTL(代码中配置)
```

---

## 11. 生产实战任务

### 11.1 任务一:KeyedState + EventTime 窗口

```scala
// code/flink/state-window.scala
class StateWindow extends KeyedProcessFunction[String, (String, Long), String] {
  @transient private var state: ValueState[Long] = _

  override def open(parameters: Configuration): Unit = {
    val ttl = StateTtlConfig.newBuilder(Time.hours(1))
      .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)
      .build()
    val descriptor = new ValueStateDescriptor[Long]("last-seen", classOf[Long])
    descriptor.enableTimeToLive(ttl)
    state = getRuntimeContext.getState(descriptor)
  }

  override def processElement(value: (String, Long), ctx: Context, out: Collector[String]): Unit = {
    val lastTs = Option(state.value()).getOrElse(0L)
    val currentTs = value._2
    if (lastTs > 0 && currentTs - lastTs > 60000) {
      out.collect(s"alert: ${value._1} idle ${currentTs - lastTs}ms")
    }
    state.update(currentTs)
  }
}
```

### 11.2 任务二:RocksDB + Incremental Checkpoint

```yaml
# flink-conf.yaml
state.backend: rocksdb
state.backend.incremental: true
state.checkpoints.dir: hdfs:///flink/checkpoints
state.backend.rocksdb.localdir: /data1/rocksdb,/data2/rocksdb
```

### 11.3 任务三:Savepoint 升级流程

```bash
# 1. 触发 savepoint
bin/flink savepoint <jobId> hdfs:///flink/savepoints

# 2. 修改代码,重新打包
mvn clean package -DskipTests

# 3. 从 savepoint 启动
bin/flink run -s hdfs:///flink/savepoints/savepoint-xxx \
  --parallelism 8 \
  -c com.bigdata.MyJobV2 \
  ./my-job-v2.jar

# 4. 验证作业
bin/flink list  # 查看 running job
```

### 11.4 任务四:Flink CDC MySQL → Doris

```scala
// code/flink/cdc-mysql-to-doris.scala
import org.apache.flink.cdc.connectors.mysql.source.MySqlSource
import org.apache.flink.streaming.api.scala._
import org.apache.doris.flink.connector.DorisSink

val source = MySqlSource.builder[String]()
  .hostname("mysql-host")
  .port(3306)
  .databaseList("mydb")
  .tableList("mydb.orders")
  .username("root")
  .password("password")
  .deserializer(new JsonDebeziumDeserializationSchema[String])
  .build()

val stream = env.fromSource(source, WatermarkStrategy.noWatermarks(), "MySQL CDC")

stream.sinkTo(DorisSink.builder()
  .setFenodes("doris-fe:8030")
  .setTableIdentifier("db.orders")
  .setUsername("root")
  .setPassword("")
  .build())

env.execute("MySQL → Doris")
```

### 11.5 任务五:状态 Schema 演进

```scala
// code/flink/state-migration.scala
class MyStatefulProcess extends KeyedProcessFunction[String, String, String]
  with CheckpointedFunction {
  @transient private var stateV2: ValueState[UserInfoV2] = _

  override def open(parameters: Configuration): Unit = {
    val descriptor = new ValueStateDescriptor[UserInfoV2]("user", TypeInformation.of(classOf[UserInfoV2]))
    stateV2 = getRuntimeContext.getState(descriptor)
  }

  override def initializeState(context: FunctionInitializationContext): Unit = {
    // v1 state 恢复逻辑
    if (context.isRestored()) {
      // 读取 v1 state,迁移到 v2
      val legacy = context.getKeyedStateStore.getState(new ValueStateDescriptor[Long]("user-v1", classOf[Long]))
      Option(legacy.value()).foreach { v1 =>
        stateV2.update(UserInfoV2(v1, ""))
      }
    }
  }

  override def snapshotState(context: FunctionSnapshotContext): Unit = {
    // snapshot v2
  }

  override def processElement(value: String, ctx: Context, out: Collector[String]): Unit = {
    val user = stateV2.value() // UserInfoV2
    out.collect(s"user=$user")
  }
}
```

---

## 12. 专家面试题

1. **KeyedState 和 OperatorState 的区别?**
   *要点*:KeyedState 按 key 划分,OperatorState 按 SubTask 划分;前者随 key 重分布自动迁移,后者要手动 rebalance(Union / Round-robin / Broadcast)。
2. **RocksDB 为什么是生产首选?**
   *要点*:内存 backend 受 JVM 堆限制,TB 级状态必爆;RocksDB 落盘 + LSM + 增量 checkpoint,容量大、增量快照小。
3. **Incremental Checkpoint 的实现?**
   *要点*:上传新增/修改的 sst 文件 + memtable WAL,restore 时合并所有增量 sst。源码 `RocksDBIncrementalCheckpoint`。
4. **Savepoint 和 Checkpoint 区别?**
   *要点*:Checkpoint 是 JobManager 周期触发 + 自动清理,用于容错;Savepoint 用户手动触发 + 永不过期,用于版本升级和并行度调整。
5. **Exactly-Once 的 Barrier 对齐怎么工作?**
   *要点*:每个 operator 收到所有上游 barrier 后才触发 snapshot,过程中阻塞其他 channel。源码 `BarrierBuffer#processBarrier`。
6. **状态 Schema 演进怎么做?**
   *要点*:用 Avro/Protobuf 支持默认值,新增字段兼容;删除字段要从所有 SubTask 中 explicit 清理;显式 StateMigration 函数处理类型变更。
7. **状态 TTL 的清理时机?**
   *要点*:三种 cleanup 策略:FullSnapshot(全量时清)、Incremental(后台线程按访问次数清)、RocksDBCompactFilter(LSM 合并时清)。
8. **Flink CDC 全量 + 增量的实现?**
   *要点*:全量 chunk 读取 + 记录 binlog offset,增量从 offset 读 binlog,union 后输出。源码 `MySqlSource`。
9. **为什么 checkpoint 完成后仍可能数据丢失?**
   *要点*:Sink 没 flush 完 + 没有 transactional sink + sink 端故障。Exactly-Once 需要幂等 sink 或二阶段提交(如 Kafka transaction)。
10. **Flink 如何保证 exactly-once + sink 到 MySQL?**
    *要点*:TwoPhaseCommitSinkFunction,beginTransaction + invoke + preCommit + commit,JobManager 通知所有 sink 一起 commit/rollback。
11. **Queryable State 怎么用?**
    *要点*:启动时设置 `queryable-state.enable`,客户端用 `QueryableStateClient` 直接查询,绕过 JobManager。延迟从秒级降到毫秒级。
12. **状态后端的选择?**
    *要点*:状态 < 10GB 用 FsStateBackend(堆),状态 > 10GB 用 RocksDBStateBackend(堆外);生产 99% 用 RocksDB。
13. **Flink CDC 怎么保证一致性?**
    *要点*:全量 + binlog offset + 状态 snapshot;Flink CDC 2.x 全量阶段用 chunk + LSN 一致性读,增量用 binlog 位点。
14. **Operator State 的三种 ListState?**
    *要点*:ListState(每 SubTask 一份)、UnionListState(union 后每个 SubTask 拿全量)、BroadcastState(广播给所有 SubTask)。

---

## 13. 一张图回顾 Flink 状态全景

```
   Flink Job
       │
       ├─ KeyedState
       │   ├─ ValueState
       │   ├─ ListState
       │   ├─ MapState
       │   ├─ ReducingState
       │   ├─ AggregatingState
       │   └─ TTL(cleanupFullSnapshot / Incrementally / RocksDBCompactFilter)
       │
       ├─ OperatorState
       │   ├─ ListState
       │   ├─ UnionListState
       │   └─ BroadcastState
       │
       ├─ State Backend
       │   ├─ MemoryStateBackend
       │   ├─ FsStateBackend
       │   └─ RocksDBStateBackend(默认,+Incremental)
       │
       ├─ 容错
       │   ├─ Checkpoint(自动 + 容错)
       │   └─ Savepoint(手动 + 版本)
       │
       └─ 应用
           ├─ Flink CDC(Debezium + binlog)
           ├─ 两阶段提交(Exactly-Once Sink)
           └─ Queryable State
```

---

## 14. 小结与下一章预告

- Flink 状态 = KeyedState + OperatorState + Raw,生产 99% 用 RocksDB + Incremental Checkpoint。
- Savepoint 是版本升级利器,Flink CDC 是 Flink 的"实时数仓接入层"。
- 下一章 [08-Flink SQL 与流批一体],进入 Flink SQL 领域:Dynamic Table、Retraction、流批一体、MiniBatch、Local-Global、Lookup Join。