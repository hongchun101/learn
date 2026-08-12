# 01 · Kafka 架构与源码解析(3.7/4.0)

> **本章定位**:从源码层讲透 Kafka 核心组件——Controller、Broker、Replica/ISR、LogSegment/Index、Producer/Broker/Consumer 三端协议、Zero Copy。
>
> **版本基线**: Kafka **3.7.x**(KRaft 模式 GA)+ **4.0**(已彻底移除 ZooKeeper)。
>
> **学习时长**:建议 12 学时(理论 4 + 源码阅读 6 + 实战 2)。

---

## 1. Kafka 整体架构

```
┌──────────────────────────────────────── Kafka Cluster ──────────────────────────────────────┐
│                                                                                              │
│   ┌─────────────────┐                          ┌─────────────────┐                          │
│   │   Producer A    │                          │   Producer B    │                          │
│   └────────┬────────┘                          └────────┬────────┘                          │
│            │                                            │                                    │
│            │     ┌──────────────────────────┐           │                                    │
│            └────▶│   Broker 0 (Leader of P0)│◀──────────┘                                    │
│                  │   Partition 0  ◀── Replica│                                               │
│                  │   Partition 1  ◀── Replica│                                               │
│                  └──────────┬───────────────┘                                               │
│                             │           │                                                    │
│                  ┌──────────▼──────┐    │   ┌─────────────────┐                             │
│                  │   Broker 1      │    │   │   Broker 2      │                             │
│                  │   Partition 0(F)│    └──▶│   Partition 1(F)│                             │
│                  │   Partition 2(L)│        │   Partition 0(F)│                             │
│                  └─────────────────┘        │   Partition 1(L)│                             │
│                                              └─────────────────┘                             │
│                                                                                              │
│   ┌─────────────────── Controller Quorum (KRaft) ────────────────────┐                       │
│   │  Controller 0 (Leader) ←── Raft ───→ Controller 1                │                       │
│   │              ▲                          Controller 2             │                       │
│   └──────────────┼────────────────────────────────────────────────────┘                       │
│                  │                                                                            │
│   ┌──────────────▼──────────────┐   ┌──────────────────┐   ┌────────────────────┐             │
│   │  Consumer Group: order-svc │   │  Consumer Group:  │   │  Kafka Connect     │             │
│   │  Topic: orders / 3 part    │   │  dwd-builder     │   │  Debezium Source   │             │
│   │  Offset: {0:1200,1:900,2:0}│   │  Offset: {0:1200}│   │  Iceberg Sink      │             │
│   └────────────────────────────┘   └──────────────────┘   └────────────────────┘             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**核心概念速查**:

| 组件 | 角色 |
| --- | --- |
| **Broker** | 一个 Kafka 进程实例,接收/存储/分发消息 |
| **Topic** | 消息分类,逻辑概念 |
| **Partition** | Topic 的物理分片,**顺序保证单位** |
| **Replica** | Partition 的副本(Leader + Followers) |
| **ISR** | 与 Leader 保持同步的副本集合 |
| **Controller** | 集群的"大脑",管理元数据(Broker 注册、Topic 创建、Leader 选举) |
| **Consumer Group** | 一组消费者协同消费,每条消息只被组内一个消费者处理 |

---

## 2. Controller —— 集群的"大脑"

### 2.1 Controller 的职责

Kafka Controller 是集群的协调者,**每个集群只有一个 Active Controller**(Standby Controller 在 KRaft 下走 Raft 协议同步状态)。

```
Controller 职责列表
├── Broker 注册管理
│   ├── Broker 加入/离开
│   └── __cluster_metadata 持久化(KRaft)
├── Topic 管理
│   ├── createTopic / deleteTopic
│   └── 增加 Partition
├── 分区 Leader 选举
│   └── 当 Leader 不可用时,从 ISR 中选新 Leader
├── 副本管理
│   └── 当 Follower 落后太多,将其从 ISR 移除
├── 集群成员变更
│   └── ControlledShutdown
└── Configuration 管理
    └── __config_changes Topic
```

### 2.2 KRaft 模式(KIP-500)

**传统模式**(ZooKeeper-based):
```
┌─────────┐         ┌──────────────┐         ┌─────────┐
│ Broker  │  Watch  │  ZooKeeper   │  Watch  │ Broker  │
│ (reads) │ ◀─────▶ │   Ensemble   │ ◀─────▶ │ (writes)│
└─────────┘         └──────────────┘         └─────────┘
                    - 临时节点(在线状态)
                    - 节点(partition信息)
                    - Watch 通知
```

**问题**:
1. ZooKeeper 成为单点性能瓶颈(元数据写延迟 + 监听风暴)。
2. 元数据两套系统(Kafka 内部 + ZK),一致性维护复杂。
3. ZK 集群本身需要独立运维(3/5 节点多数派)。

**KRaft 模式**(Kafka 3.3+ GA,4.0 默认):
```
┌─────────────────────────────────────────────────────────┐
│                  KRaft Quorum                            │
│  ┌──────────┐   Raft Log   ┌──────────┐   ┌──────────┐ │
│  │Controller│ ───────────▶ │Controller│ ─▶│Controller│ │
│  │  (Lead)  │              │ (Follow) │   │ (Follow) │ │
│  └────┬─────┘              └──────────┘   └──────────┘ │
│       │                                                  │
│       └──▶ __cluster_metadata (内部 Kafka Topic)         │
└─────────────────────────────────────────────────────────┘
```

**源码类**:`org.apache.kafka.controller.QuorumController`(Kafka 3.3+),位于 `metadata/src/main/java/org/apache/kafka/controller/`。

### 2.3 Controller 选举源码剖析

KRaft 模式下,Controller 选举由 **Raft 协议**驱动,流程如下:

```
启动流程:
1. Broker 启动 → KafkaRaftServer.startup()
2. 加载 __cluster_metadata Topic
3. 注册为 Raft Voter/Listener
4. 触发选举(超时 500ms~1s 随机)
5. 获得多数票(> N/2)的节点成为 Leader
6. 其他节点成为 Follower,定期 AppendEntries
```

**核心类**:`org.apache.kafka.raft.KafkaRaftClient`(基于 Raft 的客户端,封装 RaftClient)。

```
KafkaRaftClient 状态机:
   ┌──────────┐  election timeout  ┌──────────┐
   │ Follower │ ─────────────────▶ │Candidate │
   └────┬─────┘                    └─────┬────┘
        │                               │ 获得多数票
        │ AppendEntries                 ▼
        │                          ┌──────────┐
        └──────────────────────────│  Leader  │
                                   └──────────┘
```

### 2.4 元数据传播

Controller 是**所有元数据的唯一真源**(Source of Truth)。Broker 通过 `UpdateMetadata` RPC 接收增量变更。

```
Controller (Leader)                   Broker
     │                                   │
     ├── UpdateMetadata Request ────────▶│ (心跳 + 元数据变更)
     │ ◀─────── Response ──────────────│
     │                                   │
     └── 变更事件:                          
         ├── BrokerChange (新 Broker 上线)
         ├── TopicChange (新建 Topic)
         ├── PartitionChange (Leader 切换)
         └── ConfigChange (参数变更)
```

**源码类**:`KafkaController#sendUpdateMetadataRequest`(旧)、`ControllerApis#updateBrokerEpoch`(新 KRaft 路径)。

---

## 3. Broker —— 数据落地

### 3.1 Broker 的核心线程模型

```
┌─────────────────────────────────────────────────────────────┐
│                       Kafka Broker                            │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │Acceptor    │  │Processor   │  │Processor   │              │
│  │(监听 9092) │─▶│(NIO select)│─▶│(NIO select)│ num.network  │
│  └────────────┘  └─────┬──────┘  └────────────┘  .threads   │
│                        │                                     │
│                  ┌─────▼──────┐                              │
│                  │ RequestQueue │ 共享队列                   │
│                  └─────┬──────┘                              │
│                        │                                     │
│   ┌──────────┐  ┌──────▼─────┐  ┌──────────┐                │
│   │IO Thread │  │IO Thread   │  │IO Thread │  num.io        │
│   │(Log/Page │  │(Fetch/Disk)│  │(Produce) │  .threads      │
│   │ Cache)   │  │            │  │          │                │
│   └──────────┘  └────────────┘  └──────────┘                │
│                                                              │
│   ┌──────────────────────────────────────────┐               │
│   │  KafkaApis (请求处理,单线程按 Partition) │               │
│   │   ├── Produce ──▶ log.append()          │               │
│   │   ├── Fetch   ──▶ log.read()            │               │
│   │   ├── ListOffsets/Heartbeat             │               │
│   └──────────────────────────────────────────┘               │
│                                                              │
│   ┌──────────────────────────────────────────┐               │
│   │  LogManager (管理所有 Partition 的 Log)  │               │
│   │   ├── Partition 0 → /data/kafka/topic-0/│               │
│   │   └── Partition 1 → /data/kafka/topic-1/│               │
│   └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 物理存储结构(LogSegment)

每台 Broker 上,每个 Partition 对应一个目录,目录下有多个**LogSegment**。

```
/data/kafka/
├── logs/
│   ├── topic-orders-0/                    ← Partition 0
│   │   ├── 00000000000000000000.log       ← Segment 0 (消息数据)
│   │   ├── 00000000000000000000.index     ← 稀疏索引 (offset → position)
│   │   ├── 00000000000000000000.timeindex ← 时间戳索引
│   │   ├── 00000000000000123456.log       ← Segment 1
│   │   ├── 00000000000000123456.index
│   │   ├── 00000000000000123456.timeindex
│   │   ├── leader-epoch-checkpoint        ← Leader epoch 检查点
│   │   └── partition.metadata             ← Partition 元数据
│   │
│   ├── topic-orders-1/                    ← Partition 1
│   │
│   └── __consumer_offsets-42/             ← 内部 Topic,存 offset
│
└── meta.properties                          ← cluster.id
```

**Segment 滚动策略**(任一满足):
- `log.segment.bytes=1GB`(默认)
- `log.segment.ms=604800000`(默认 7 天)
- 索引文件满了

### 3.3 LogSegment 内部结构

```
单个 LogSegment 文件结构
┌─────────────────────────────────────────────────────────┐
│                    .log 文件                              │
│                                                          │
│  ┌──────┬────────────────────────────────────────────┐   │
│  │Offset│ RecordBatch (一批消息)                     │   │
│  │  0   │  ┌──────────────────────────────────────┐  │   │
│  │      │  │ RecordBatch Header (12字节)          │  │   │
│  │      │  │  - baseOffset: 8字节                  │  │   │
│  │      │  │  - batchLength: 4字节                 │  │   │
│  │      │  ├──────────────────────────────────────┤  │   │
│  │      │  │ Record 1 ┌──────────────────────────┐│  │   │
│  │      │  │          │length: varint            ││  │   │
│  │      │  │          │attributes: 1字节         ││  │   │
│  │      │  │          │timestampDelta: varint    ││  │   │
│  │      │  │          │offsetDelta: varint       ││  │   │
│  │      │  │          │keyLength: varint         ││  │   │
│  │      │  │          │key: bytes                ││  │   │
│  │      │  │          │valueLength: varint       ││  │   │
│  │      │  │          │value: bytes              ││  │   │
│  │      │  │          │headers: varint[]         ││  │   │
│  │      │  │          └──────────────────────────┘│  │   │
│  │      │  ├──────────────────────────────────────┤  │   │
│  │      │  │ Record 2 ...                          │  │   │
│  │      │  └──────────────────────────────────────┘  │   │
│  │      │  CRC32C Checksum (4字节)                  │   │
│  │      └──────────────────────────────────────┘    │   │
│  └──────┴────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**关键设计**:
- **RecordBatch 批量写入**:Producer 端 `linger.ms=20` + `batch.size=16KB`,Broker 端再写入 `log.append()`。
- **CRC32C 校验**:每条 RecordBatch 末尾有 CRC,防止磁盘静默错误。
- **变长字段**:Kafka 0.11+ 使用 varint 编码,节省空间 30%+。

**索引文件结构**:

```
.index 文件 (offset → physical position 映射,稀疏索引)
┌─────────────────────────────────────────────────────┐
│  IndexEntry 0: (baseOffset=0, position=0)            │
│  IndexEntry 1: (baseOffset=12345, position=4096)    │ ← 每 4KB 写一个索引
│  IndexEntry 2: (baseOffset=24690, position=8192)    │
└─────────────────────────────────────────────────────┘

.timeindex 文件 (timestamp → offset 映射)
┌─────────────────────────────────────────────────────┐
│  TimeIndexEntry 0: (timestamp=1700000000, offset=0)  │
│  TimeIndexEntry 1: (timestamp=1700003600, offset=12345) │
└─────────────────────────────────────────────────────┘
```

**查找流程**(以 offset=15000 为例):
1. 二分查找 `.index`,找到 ≤ 15000 的最大索引项 `(12345 → 4096)`。
2. 从物理位置 4096 开始顺序扫描 `.log`,定位到 offset=15000。
3. **最大扫描开销** = `indexIntervalBytes / 2` = 2KB(因为每 4KB 一个索引)。

### 3.4 源码类索引(Broker)

| 类 | 路径 |
| --- | --- |
| `KafkaServer` | `core/src/main/scala/kafka/server/KafkaServer.scala` |
| `KafkaApis` | `core/src/main/scala/kafka/server/KafkaApis.scala` |
| `LogManager` | `core/src/main/scala/kafka/log/LogManager.scala` |
| `Log` | `core/src/main/scala/kafka/log/Log.scala` |
| `LogSegment` | `core/src/main/scala/kafka/log/LogSegment.scala` |
| `OffsetIndex` | `core/src/main/scala/kafka/log/OffsetIndex.scala` |
| `FileRecords` | `core/src/main/scala/kafka/log/FileRecords.scala` |

**源码阅读路线**:`KafkaServer.startup → LogManager → Log.append → FileRecords.append` —— 看一条消息如何落地磁盘。

---

## 4. Replica / ISR 机制

### 4.1 副本角色

```
Partition 的副本分布(以 3 副本为例,Broker 0/1/2)
┌──────────────────────────────────────────────┐
│ Partition 0                                  │
│                                              │
│   Broker 0 (Leader)   ⭐ 接收 Producer 写入    │
│   Broker 1 (Follower) 📥 拉取 Leader 数据     │
│   Broker 2 (Follower) 📥 拉取 Leader 数据     │
└──────────────────────────────────────────────┘

ISR (In-Sync Replicas): [Broker 0, Broker 1]   ← Broker 2 落后被踢出
OSR (Out-of-Sync Replicas): [Broker 2]
AR (Assigned Replicas): [Broker 0, Broker 1, Broker 2]
```

**定义**:
- **AR**:分配给该 Partition 的所有副本。
- **ISR**:与 Leader 保持"同步"的副本(`replica.lag.time.max.ms=30000` 内有 Fetch)。
- **OSR**:落后 ISR 的副本。

### 4.2 Follower 同步流程

```
Producer           Leader Broker         Follower Broker
   │                    │                       │
   ├── Produce ────────▶│                       │
   │                    ├── Append to Page Cache│
   │                    ├── Replicate ─────────▶│
   │                    │   (FollowerFetch)    │
   │                    │                       ├── Fetch from Leader
   │                    │                       ├── Append to Log
   │                    │ ◀─── Fetch Offset ───│
   │                    │                       │
   │ ◀─── ACK ──────────│ (when acks=all + min.insync.replicas)
   │                    │                       │
```

**核心参数**:
- `replica.lag.time.max.ms=30000`:Follower 超过 30s 未同步,被踢出 ISR。
- `num.replica.fetchers=4`:Follower 拉取线程数。
- `replica.fetch.min.bytes=1` / `replica.fetch.max.bytes=1048576`:拉取大小。

### 4.3 Leader 选举

**触发场景**:
1. Leader Broker 崩溃。
2. Controller 主动切换(滚动重启)。
3. `unclean.leader.election.enable=true` 时,ISR 为空时从 OSR 选举(有数据丢失风险)。

**选举优先级**:
1. **优先从 ISR 中选**(保证数据不丢)。
2. **优先从 AR 列表按顺序选**(保证副本分布均衡)。

```
选举算法(简化):
   if (ISR.isNotEmpty):
       newLeader = AR.first(replica => ISR.contains(replica))
   else if (unclean.leader.election.enable):
       newLeader = AR.first()  # 可能丢数据!
   else:
       Partition 不可用
```

### 4.4 HW(High Watermark)与 LEO(Log End Offset)

- **LEO**:Log 当前最后一条消息的 offset + 1,即"下一条要写入的位置"。
- **HW**:所有 ISR 中最小的 LEO,即"Consumer 可见的最大 offset"。

```
Partition 状态(Replica 0=Leader, 1/2=Follower)
┌────────────────────────────────────────────────┐
│  Replica 0 (Leader):   [m0,m1,m2,m3,m4]  LEO=5 │
│  Replica 1 (Follower): [m0,m1,m2]       LEO=3 │
│  Replica 2 (Follower): [m0,m1,m2,m3]    LEO=4 │
│                                                │
│  HW = min(LEO0, LEO1, LEO2) = 3                │
│                                                │
│  Consumer 只能读到 HW=3 之前的消息              │
└────────────────────────────────────────────────┘
```

**Kafka 0.11+ 引入 Leader Epoch**:解决 HW 切换时的"脑裂"丢数据问题。每个 Leader 任期有一个 epoch,Fetcher 记录 `(leaderEpoch, offsetStart)`。

**源码类**:`Partition#recordAppend`,`Replica#highWatermark`,`LeaderEpochFileCache`。

---

## 5. Producer 端深度剖析

### 5.1 Producer 整体流程

```
                   KafkaProducer
   ┌─────────────────────────────────────────┐
   │  1. send(record)                         │
   │     ↓                                    │
   │  2. 拦截器 (ProducerInterceptor)          │
   │     ↓                                    │
   │  3. 序列化 (Serializer<K,V>)              │
   │     ↓                                    │
   │  4. 分区器 (Partitioner.partition)        │
   │     ↓                                    │
   │  5. RecordAccumulator (按 (topic,part) 缓存)│
   │     ↓                                    │
   │  6. Sender 线程 (后台)                    │
   │     ├── 拉取批次                          │
   │     ├── 构造 ProduceRequest               │
   │     ├── 发送到 Leader                     │
   │     └── 处理 Response                     │
   └─────────────────────────────────────────┘
```

### 5.2 RecordAccumulator —— 内存批缓存

```
RecordAccumulator 内部结构
┌─────────────────────────────────────────────────────┐
│                                                     │
│   ConcurrentMap<TopicPartition, Deque<ProducerBatch>>│
│                                                     │
│   TopicPartition(t, p) ──▶ [b1][b2][b3]...           │
│                            ▲                        │
│                            │ newest (tail)          │
│                                                     │
│   每个 ProducerBatch:                                 │
│   ┌──────────────────────────────────────┐          │
│   │  MemoryRecordsBuilder                 │          │
│   │  - records: List<Record>              │          │
│   │  - maxSize: batch.size (默认 16KB)    │          │
│   │  - linger.ms (默认 0,可设 20~50)      │          │
│   │  - tryAppend() → 满了就返回 false     │          │
│   └──────────────────────────────────────┘          │
└─────────────────────────────────────────────────────┘
```

**关键源码**:`org.apache.kafka.clients.producer.internals.RecordAccumulator#append`。

```java
// 简化版 append 逻辑
public RecordAppendResult append(TopicPartition tp, long timestamp, byte[] key, byte[] value,
                                  Header[] headers, Callback callback, long maxTimeToBlock) {
    Deque<ProducerBatch> dq = getOrCreateDeque(tp);
    synchronized (dq) {
        // 尝试追加到已有的最后一个 batch
        ProducerBatch last = dq.peekLast();
        if (last != null) {
            FutureRecordMetadata future = last.tryAppend(timestamp, key, value, headers, callback);
            if (future != null) return new RecordAppendResult(future, dq.size(), true);
        }
    }
    // 申请新 batch(从 BufferPool 借内存)
    int size = Math.max(this.batchSize, AbstractRecords.estimateSizeInBytesUpperBound(...));
    ByteBuffer buffer = free.allocate(size, maxTimeToBlock);
    synchronized (dq) {
        ProducerBatch batch = new ProducerBatch(tp, buffer, ...);
        FutureRecordMetadata future = batch.tryAppend(...);
        dq.addLast(batch);
        incomplete.add(batch);
        return new RecordAppendResult(future, dq.size(), false);
    }
}
```

### 5.3 Sender 线程

```
Sender 线程主循环(while running):
   1. 从 RecordAccumulator 收集已满 / linger 到的批次
   2. 按 NodeId 分组(同一 Broker 的请求合并)
   3. 构造 ClientRequest → NetworkClient
   4. 等待 Broker Response
   5. 处理 Response:
      ├── Success → 触发 Callback
      └── Error:
          ├── 可重试 (RetriableException) → 重新入队
          └── 不可重试 → 触发 Callback with exception
```

**关键参数**:
- `max.in.flight.requests.per.connection=5`:同一连接上最多 5 个未确认请求(保证幂等时 ≤ 5)。
- `delivery.timeout.ms=120000`:总投递超时。
- `request.timeout.ms=30000`:单次请求超时。
- `linger.ms=20`:批等待时间(平衡吞吐与延迟)。

### 5.4 Acks 语义

```
acks=0  Producer 不等 ACK,直接返回成功
        ├── 延迟: 最低 (~1ms)
        └── 可靠性: 最低 (可能丢消息)

acks=1  Producer 等 Leader 写入后 ACK
        ├── 延迟: 中 (~5ms)
        └── 可靠性: 中 (Leader 写入但未复制就崩溃则丢)

acks=all (或 -1)  Producer 等所有 ISR 写入后 ACK
        ├── 延迟: 高 (~10-30ms)
        └── 可靠性: 高 (需配合 min.insync.replicas≥2)
```

**源码**:`org.apache.kafka.clients.producer.internals.Sender#sendProduceRequests`。

### 5.5 幂等 Producer 原理

```
Producer 启动(enable.idempotence=true)
   │
   ▼
initTransactions() / 启动时自动
   │
   ▼
InitProducerId Request ──▶ Broker (TransactionCoordinator)
   │  返回: PID + epoch
   │
   ▼
每条 Record 打上 (PID, epoch, sequenceNumber)
   │
   ▼
Produce Request ──▶ Broker 验证:
   │  - PID 是否有效
   │  - sequenceNumber 是否连续
   │  - epoch 是否最新
   │
   ▼
若 sequenceNumber 重复 → 丢弃,返回 DuplicateError
若 sequenceNumber 跳跃 → ProducerIdFenced,关闭 Producer
```

**关键类**:`ProducerIdManager`,`RecordAccumulator.append` 设置 sequence,`Sender` 处理 Duplicate 响应。

---

## 6. Consumer 端深度剖析

### 6.1 Consumer Group 与 Rebalance

```
Consumer Group 状态机(Kafka 2.5+ 引入 CooperativeStickyAssignor)
   ┌─────────┐  rebalance   ┌──────────────┐
   │ Stable  │ ────────────▶│ PreparingReb │
   └────▲────┘              └──────┬───────┘
        │                         │
        │    onJoinComplete       ▼
        │                  ┌──────────────┐
        └──────────────────│ CompletingReb│
                           └──────────────┘

   协议:Kafka 2.4+ 引入 KIP-848(新的 Group Coordinator 协议),
         Consumer 主动向 Coordinator 发送 Subscribe/Join 请求。
```

**分配策略**(`partition.assignment.strategy`):
- **Range**(默认):每个 Topic 内按分区号排序分配,简单但可能不均。
- **RoundRobin**:所有 Topic 的所有 Partition 一起轮询分配。
- **Sticky**:尽量保留已有分配,Rebalance 时减少迁移(KIP-54)。
- **CooperativeSticky**(推荐,KIP-429):增量 Rebalance,只迁移必要的 Partition。

### 6.2 Consumer 工作流程

```
Consumer 主循环(poll loop):
   ┌──────────────────────────────────────────┐
   │ 1. ensureCoordinatorReady (JoinGroup)     │
   │ 2. poll(Fetch)                            │
   │    ├── 计算 fetch offset (committed + 1)  │
   │    ├── 构造 FetchRequest                  │
   │    ├── 发送到 Leader                      │
   │    ├── 解析 FetchResponse                 │
   │    └── 回调 ConsumerRecord 集合           │
   │ 3. 用户处理 records                       │
   │ 4. commitSync / commitAsync               │
   │ 5. heartbeat thread (独立线程,定时心跳)    │
   └──────────────────────────────────────────┘
```

**关键参数**:
- `enable.auto.commit=false`:手动提交,生产推荐。
- `auto.offset.reset=earliest`:无 offset 时从最早开始。
- `max.poll.records=500`:单次拉取最大记录数。
- `max.poll.interval.ms=300000`:两次 poll 最大间隔。
- `session.timeout.ms=45000`(≥ `heartbeat.interval.ms * 3`)。
- `fetch.min.bytes=1` / `fetch.max.bytes=52428800`:拉取字节数。
- `isolation.level=read_committed`:只读已提交事务。

### 6.3 Offset 提交机制

```
Offset 提交路径:

Consumer.commitSync()
   │
   ▼
构造 OffsetCommitRequest
   │  (group, topic-partition-list, offset, metadata)
   │
   ▼
发送到 GroupCoordinator(由 __consumer_offsets Partition Leader 担当)
   │
   ▼
Coordinator 写入 __consumer_offsets Topic (50 个 Partition,默认)
   │
   ▼
返回 ACK

读取路径:
Consumer.poll() → 找到 Coordinator → 发送 OffsetFetchRequest → 读取已提交 offset
```

**源码类**:`org.apache.kafka.clients.consumer.internals.ConsumerCoordinator#commitOffsetsSync`。

---

## 7. Zero Copy 原理

### 7.1 传统文件传输(4 次拷贝)

```
传统 IO 路径(FileChannel.transferTo 优化前):
┌──────────┐  read()   ┌──────────┐  write()  ┌──────────┐
│  Disk    │ ────────▶ │ Kernel   │ ────────▶ │ Socket   │
│          │           │ Buffer   │           │ Buffer   │
└──────────┘           └────┬─────┘           └────┬─────┘
                            │ copy()               │ copy()
                            ▼                      ▼
                       ┌──────────┐           ┌──────────┐
                       │ User     │           │ NIC      │
                       │ Buffer   │           │ Buffer   │
                       └──────────┘           └──────────┘

4 次拷贝:Disk → Kernel → User → Kernel → Socket → NIC
4 次上下文切换:read → copy → write → ...
```

### 7.2 Zero Copy(2 次拷贝)

```
sendfile / FileChannel.transferTo:
┌──────────┐  DMA   ┌──────────┐  DMA   ┌──────────┐
│  Disk    │ ─────▶ │ Kernel   │ ─────▶ │ Socket   │ → NIC
└──────────┘        └──────────┘        └──────────┘
                    (Page Cache)

2 次拷贝:Disk → Kernel(Page Cache) → NIC
0 次 CPU 拷贝:DMA 直接搬运
```

### 7.3 Kafka 中的应用

```java
// Kafka FileRecords.readInto 核心调用
public int readInto(ByteBuffer channelBuffer, int position, int length) {
    return fileChannel.transferTo(position + start, length, countChannel);
    // 底层调用 sendfile(2) 系统调用(Linux)
}

// java.nio.channels.FileChannel#transferTo
public abstract long transferTo(long position, long count, WritableByteChannel target);
// 0 次 CPU 拷贝,2 次 DMA 拷贝
```

**Linux 内核调用链**:
```
Kafka Broker
   ↓ sendfile(out, in_fd, offset, count)
Kernel Page Cache
   ↓ DMA
NIC Ring Buffer
   ↓ DMA
Network
```

**性能对比**(典型数据):
| 方式 | 延迟 | CPU 占用 |
| --- | --- | --- |
| 传统 IO | ~10 ms/GB | 高(60%+) |
| Zero Copy | ~1 ms/GB | 低(5%) |

**源码类**:`org.apache.kafka.common.network.FileSend` / `FileRecords#transferTo`。

---

## 8. 关键源码类总表

| 模块 | 核心类 | 路径 |
| --- | --- | --- |
| Producer | `KafkaProducer` | `clients/src/main/java/org/apache/kafka/clients/producer/KafkaProducer.java` |
| Producer 内部 | `RecordAccumulator` | `clients/src/main/java/org/apache/kafka/clients/producer/internals/RecordAccumulator.java` |
| Sender | `Sender` | `clients/src/main/java/org/apache/kafka/clients/producer/internals/Sender.java` |
| Consumer | `KafkaConsumer` | `clients/src/main/java/org/apache/kafka/clients/consumer/KafkaConsumer.java` |
| Consumer 协调 | `ConsumerCoordinator` | `clients/src/main/java/org/apache/kafka/clients/consumer/internals/ConsumerCoordinator.java` |
| Broker 服务 | `KafkaServer` | `core/src/main/scala/kafka/server/KafkaServer.scala` |
| 请求处理 | `KafkaApis` | `core/src/main/scala/kafka/server/KafkaApis.scala` |
| Controller (KRaft) | `QuorumController` | `metadata/src/main/java/org/apache/kafka/controller/QuorumController.java` |
| 元数据 | `KafkaRaftClient` | `raft/src/main/java/org/apache/kafka/raft/KafkaRaftClient.java` |
| 日志 | `Log` | `core/src/main/scala/kafka/log/Log.scala` |
| 日志段 | `LogSegment` | `core/src/main/scala/kafka/log/LogSegment.scala` |
| 索引 | `OffsetIndex` | `core/src/main/scala/kafka/log/OffsetIndex.scala` |
| 网络层 | `KafkaChannel` | `common/network/src/main/java/org/apache/kafka/common/network/KafkaChannel.java` |

---

## 9. 生产配置基线(Kafka 3.7)

```properties
# ============ Broker 端 ============
broker.id=1
listeners=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
process.roles=broker,controller         # KRaft 模式,Broker 兼任 Controller
node.id=1
controller.quorum.voters=1@broker1:9093,2@broker2:9093,3@broker3:9093
controller.listener.names=CONTROLLER
inter.broker.listener.name=PLAINTEXT
advertised.listeners=PLAINTEXT://broker1:9092

# 存储
log.dirs=/data1/kafka,/data2/kafka,/data3/kafka
log.segment.bytes=1073741824            # 1GB
log.retention.hours=72
log.cleanup.policy=delete                # 或 compact(压缩)
num.io.threads=16
num.network.threads=8

# 副本
default.replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false
replica.lag.time.max.ms=30000

# 分区
num.partitions=12                        # 新建 Topic 默认分区数
auto.create.topics.enable=false         # 生产禁止

# 网络
socket.send.buffer.bytes=1048576
socket.receive.buffer.bytes=1048576
num.replica.fetchers=4

# ============ Producer 端 ============
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
retries=2147483647
delivery.timeout.ms=120000
compression.type=zstd                    # 或 lz4, snappy
linger.ms=20
batch.size=16384
buffer.memory=67108864                   # 64MB

# ============ Consumer 端 ============
enable.auto.commit=false
isolation.level=read_committed
max.poll.records=500
session.timeout.ms=45000
heartbeat.interval.ms=3000
max.poll.interval.ms=300000
fetch.min.bytes=1
fetch.max.bytes=52428800
partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor
```

---

## 10. 专家面试题

> **Q1**:**Kafka Controller 在 KRaft 模式下如何保证元数据一致性?**
>
> **参考答案**:
> 1. Controller Quorum(默认 3 节点)走 **Raft 协议**,所有元数据变更作为 Raft Log 条目持久化。
> 2. Leader 选举需**多数派**同意,避免脑裂。
> 3. 元数据变更写入内部 `__cluster_metadata` Topic,Broker 通过 `UpdateMetadata` RPC 拉取。
> 4. **优势**:不再依赖 ZK,延迟从几十 ms 降到几 ms,元数据容量提升 10 倍。

> **Q2**:**ISR 收缩时,`min.insync.replicas=2` 但 ISR 只有 1 个副本,Producer `acks=all` 会怎样?**
>
> **参考答案**:
> - Producer 收到 `NotEnoughReplicasException`(可重试)。
> - 在 `delivery.timeout.ms` 内重试。
> - 仍不恢复则抛 `TimeoutException`,业务感知失败。
> - **生产建议**:监控 `UnderReplicatedPartitions` JMX 指标,设阈值 > 0 时告警。

> **Q3**:**Kafka 的 Zero Copy 是不是完全不需要 JVM 内存?**
>
> **参考答案**:
> - Zero Copy 让数据从 Page Cache 直接到 NIC,**绕过 User Buffer**。
> - 但 Kafka 仍依赖 **Page Cache 命中**(≈ JVM Off-Heap),所以内存仍是关键。
> - **公式**:建议 Broker 内存 = `Page Cache + JVM Heap(6-8GB)`。
> - `Page Cache` 应尽量容纳活跃 Segment(≈ `log.dirs 磁盘 / 2`)。

> **Q4**:**为什么 Kafka Consumer Group Rebalance 会导致重复消费?**
>
> **参考答案**:
> 1. 旧 Consumer A 在 Rebalance 前已拉到一批数据但未提交 offset。
> 2. Rebalance 把 Partition 分给新 Consumer B。
> 3. B 从上次 committed offset 重新消费。
> 4. **应对**:开启 **手动提交**(处理完一批 commitSync),或使用 **Exactly-Once** 事务。

> **Q5**:**Kafka 4.0 彻底移除 ZooKeeper,迁移到 KRaft,我们怎么升级?**
>
> **参考答案**:
> 1. **先升级 Kafka 到 3.3+(支持 KRaft 但仍可依赖 ZK)**。
> 2. 用 `kafka-storage.sh format -t <clusterId> -c <kraft-config>` 初始化 KRaft 元数据。
> 3. 双写过渡期:同时配置 ZK 和 KRaft Controller,逐步切流量。
> 4. **生产建议**:在测试集群先跑 1 个月,确认无性能回退。

---

## 11. 生产实战清单

- [ ] **Step 1:本地 3 节点 KRaft 集群部署** — 用 `kafka-server-start.sh` 启动 3 个 Broker(同进程跑 broker+controller),验证 Controller 自动选举。
- [ ] **Step 2:Producer 压测** — 用 `kafka-producer-perf-test.sh` 跑 100 万 msg/s,观察 `request-latency-avg`、`record-send-rate`、`batch-size-avg`。
- [ ] **Step 3:Consumer 延迟监控** — 启动 Consumer,故意制造 1 小时延迟,观察 `records-lag-max` JMX 指标。
- [ ] **Step 4:故障演练** — `kill -9` Leader Broker,Producer 阻塞时长、ISR 收缩、Controller 切换时间是否 < 30s。
- [ ] **Step 5:幂等验证** — 启动 `enable.idempotence=true` Producer,故意代码层 retry,下游 MySQL 主键验证无重复。
- [ ] **Step 6:Zero Copy 验证** — 用 `perf stat -e cs,migrations` 监控 Kafka 进程的系统调用,确认 transferTo 比例。
- [ ] **Step 7:源码阅读** — 用 IDE 打开 `KafkaProducer.java` 走读 `send → partition → append → drain → sendProduceRequest`,记录 3 条笔记。
- [ ] **Step 8:事务验证** — 跑 `initTransactions + beginTransaction + send + commitTransaction`,观察 `__transaction_state` Topic 内容。
- [ ] **Step 9:压缩 Topic** — 创建 `cleanup.policy=compact` Topic,验证相同 key 只保留最新值。
- [ ] **Step 10:升级演练** — 在测试集群跑 KRaft 模式 1 周,记录任何告警/异常。

**完成标志**:能从源码讲清楚"一条消息从 Producer 到 Consumer 的完整路径",并能用 `jstack` 抓出 Kafka 的线程模型证明 Controller 是单一活跃。

---

## 12. 一句话总结

> **Kafka 不是一个"消息队列",而是一个"分布式持久化日志 + 消费者自行管理 Offset"的事件流平台。** 所有设计取舍(Partition、ISR、Zero Copy、KRaft)都是为"高吞吐 + 可重放 + 水平扩展"三个目标服务。

---

**下一章预告**:**[02-Kafka 调优与生产陷阱](./02-kafka-tuning.md)** —— Page Cache 调优、Broker/Producer/Consumer 参数基线、Replicator 拉取优化、KIP-500/KRaft 改进路线。