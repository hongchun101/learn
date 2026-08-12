# 03 · Pulsar 与新一代消息系统

> **本章定位**:讲透 Pulsar 分层架构、BookKeeper 存储、主题/订阅模型、与 Kafka 的对比、Pulsar Functions 计算。
>
> **版本基线**:Pulsar **3.x**(已全面支持分层存储、事务、Functions)。
>
> **学习时长**:建议 8 学时(理论 3 + 源码 3 + 实战 2)。

---

## 1. 为什么需要 Pulsar?

Kafka 在 2010 年设计时,假设"存储便宜,计算贵",所以**Broker 强耦合存储**(Broker 负责管理本地磁盘 + Partition Leader)。这套架构在云原生时代遇到三个挑战:

1. **扩容难**:加 Broker 要重新平衡 Partition,数据要跨节点搬迁,代价大。
2. **存算耦合**:Broker 既要管协议又要管磁盘,故障域大。
3. **冷数据归档**:冷数据留在本地磁盘浪费成本。

**Pulsar 的核心思想**:**存算分离** —— Broker 无状态(只算协议),数据下沉到 BookKeeper(分布式共享存储)。

```
Kafka 架构(存算耦合):
┌────────────────────────────────────────────┐
│ Broker 1                                   │
│  ├─ Topic A-Partition 0 (Leader) + Disk    │
│  ├─ Topic A-Partition 1 (Follower) + Disk │
│  └─ Topic B-Partition 0 (Leader) + Disk    │
├────────────────────────────────────────────┤
│ Broker 2                                   │
│  ├─ Topic A-Partition 1 (Leader) + Disk    │
│  └─ ...                                     │
└────────────────────────────────────────────┘
  ↑ 加 Broker 要做迁移,扩缩容慢

Pulsar 架构(存算分离):
┌────────────────────────────────────────────┐
│ Broker 1 (无状态,服务协议)                  │
│  ├─ 服务 Topic A 多个分片                    │
│  └─ 服务 Topic B                            │
├────────────────────────────────────────────┤
│ Broker 2 (无状态)                            │
└────────────────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│ BookKeeper Cluster(共享存储)                │
│  ├─ Bookie 1 ─┐                              │
│  ├─ Bookie 2 ─┤ 一致性协议写多副本            │
│  └─ Bookie 3 ─┘                              │
└────────────────────────────────────────────┘
  ↑ 加 Broker 立刻承接流量,扩缩容快
```

---

## 2. Pulsar 整体架构

```
┌───────────────────────────── Pulsar Cluster ─────────────────────────────┐
│                                                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │ Producer Client │  │ Producer Client │  │ Consumer Client │           │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│           │ Web Service │      │                    │                    │
│           ▼              ▼      ▼                    ▼                    │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                  Pulsar Broker (无状态)                          │   │
│  │   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │   │
│  │   │  Broker 1    │ │  Broker 2    │ │  Broker 3    │            │   │
│  │   │  - 协议层     │ │  - 协议层    │ │  - 协议层    │            │   │
│  │   │  - 调度       │ │  - 调度      │ │  - 调度      │            │   │
│  │   │  - Topic发现  │ │              │ │              │            │   │
│  │   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │   │
│  │          │   ┌────────┐   │                │                    │   │
│  │          └──▶│  ZK    │◀──┘                │  (元数据)            │   │
│  │              └────────┘                    │                    │   │
│  └─────────────────┬──────────────────────────┬─────────────────────┘   │
│                     │ (Ledger 读写)              │                         │
│                     ▼                          ▼                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │              BookKeeper Cluster (共享存储)                       │   │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │   │  Bookie 1 │  │  Bookie 2 │  │  Bookie 3 │  │  Bookie 4 │        │   │
│  │   │  (Journal │  │  (Journal │  │  (Journal │  │  (Journal │        │   │
│  │   │   + Entry│  │   + Entry │  │   + Entry │  │   + Entry │        │   │
│  │   │   Log +  │  │   Log +   │  │   Log +   │  │   Log +   │        │   │
│  │   │   Index) │  │   Index)  │  │   Index)  │  │   Index)  │        │   │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────┘         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│   ┌─────────────┐                                                          │
│   │  Functions  │  ← 轻量流计算(类似 Lambda)                              │
│   │  / IO / Sinks│                                                          │
│   └─────────────┘                                                          │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. BookKeeper —— 分布式共享存储

### 3.1 Bookie 内部结构

Bookie 是 BookKeeper 的存储节点,类似 Kafka 的 Broker,但只负责存。

```
Bookie 进程结构
┌──────────────────────────────────────────────────────────┐
│  Bookie Server                                            │
│  ┌──────────────────────────────────────────────┐       │
│  │  Entry Logger(顺序写入口)                      │       │
│  │   - 写入 Journal(预写日志,fsync)              │       │
│  │   - 异步刷到 Entry Log(按 Ledger 顺序写)       │       │
│  └────────┬─────────────────────────────────────┘       │
│           │                                              │
│  ┌────────▼─────────────────────────────────────┐       │
│  │  Ledger Cache(读缓存)                          │       │
│  │   - Page Cache 命中优先                         │       │
│  │   - 未命中从 Entry Log 读                       │       │
│  └────────┬─────────────────────────────────────┘       │
│           │                                              │
│  ┌────────▼─────────────────────────────────────┐       │
│  │  Ledger Index(稀疏索引)                        │       │
│  │   - Entry ID → 文件 offset                     │       │
│  │   - 内存 + RocksDB 持久化                       │       │
│  └────────┬─────────────────────────────────────┘       │
│           │                                              │
│  ┌────────▼─────────────────────────────────────┐       │
│  │  Garbage Collector(后台清理已关闭 Ledger)      │       │
│  └──────────────────────────────────────────────┘       │
│                                                          │
│  磁盘布局:                                                │
│  /data/journal/current.log      ← Journal(WAL)          │
│  /data/ledgers/current/LedgerId/EntryLog-* ← 数据        │
│  /data/ledgers/current/LedgerId/Index-*      ← 索引     │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Ledger —— 存储的最小单元

Ledger 是 BookKeeper 的核心抽象,**一个 Ledger 是一个 append-only 的日志**:

```
Ledger 生命周期:
┌──────────────────────────────────────────────────────────┐
│                                                           │
│   创建(Open)  ───▶  写入(Append)  ───▶  关闭(Close)       │
│     │                  │                     │             │
│     │                  │ 持续写              │ 不再写      │
│     │                  │                     │             │
│     │                  ▼                     ▼             │
│     │           累积 Entry             标记为可回收        │
│     │                                  (等所有 Reader 走完)│
│                                                           │
│   同一 Topic 的不同分片 = 不同 Ledger                      │
│   Topic-A Partition-0:                                    │
│     Ledger-1 (1MB → 关闭 → 新开 Ledger-2)                  │
│     Ledger-2 (1MB → 关闭 → 新开 Ledger-3)                  │
│     ...                                                    │
└──────────────────────────────────────────────────────────┘
```

**关键特性**:
- **Ledger 大小可配置**(默认 1MB,推荐 100MB~1GB)。
- **关闭后不可再写**,但**可读**(被多个 Consumer 共享)。
- **可被多个 Bookie 副本**(Ensemble,默认 3)。
- **Ack Quorum**(`ackQuorum=2`):写多少副本算成功。

### 3.3 写入流程

```
Pulsar Producer → Broker → Bookie
   │                │         │
   │ send(msg)      │         │
   │ ──────────────▶│         │
   │                │ 计算 Ledger (按 Topic+Partition)
   │                │ 检查是否需要轮转 Ledger
   │                │         │
   │                │ AddEntry Request (entry data)
   │                │ ───────▶│
   │                │         ├── 写入 Journal (fsync)
   │                │         ├── 复制到 ackQuorum 个 Bookie
   │                │         │   (默认 Bookie-1/2/3 各一份)
   │                │         │
   │                │ ◀──── ACK (lastAddConfirmed)
   │                │         │
   │ ◀──── 写入成功 (entryId) │
   │                │         │
```

**核心类**:`org.apache.bookkeeper.client.BookKeeper#asyncAddEntry`,`org.apache.bookkeeper.server.service.BookieService`。

### 3.4 读取流程

```
Consumer → Broker → Bookie
   │          │        │
   │          │ 找到 Ledger
   │          │ (读位置 → entry ID)
   │          │ ──────▶│
   │          │        │ 读 Entry Cache
   │          │        │ 命中 → 返回
   │          │        │ 未命中 → 读 Entry Log
   │          │ ◀──────│
   │          │ Entry batch
   │ ◀───────│
   │
```

**关键类**:`org.apache.bookkeeper.client.LedgerHandle#asyncReadEntries`。

---

## 4. Broker —— 无状态协议层

### 4.1 Broker 的职责

Broker 是 Pulsar 的"门面",只做三件事:

1. **协议转换**:Producer/Consumer 客户端 → BookKeeper API。
2. **订阅状态管理**(Exclusive / Failover / Shared / Key_Shared)。
3. **路由与负载均衡**(Bundle → Owner Broker 映射)。

```
Broker 核心组件
┌─────────────────────────────────────────────┐
│  Pulsar Broker                              │
│  ┌─────────────────────────────────────┐   │
│  │  TopicPoliciesService(策略管理)       │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  PersistentTopic / NonPersistentTopic│   │
│  │   - 每个 Topic 在 Owner Broker 上有实例│   │
│  │   - 管理订阅状态                       │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  ManagedLedger(BookKeeper 客户端封装)   │   │
│  │   - 创建/打开 Ledger                  │   │
│  │   - 异步写入                          │   │
│  │   - 维护 Cursor(消费位置)              │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  WebService / REST API                │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 4.2 Bundle 机制

Broker 通过 **Bundle**(命名空间+hash 范围)做负载均衡:

```
命名空间: my-tenant/my-namespace
   Bundle-1: hash 0x00000000 ~ 0x3FFFFFFF (含 Topic A)
   Bundle-2: hash 0x40000000 ~ 0x7FFFFFFF (含 Topic B)
   Bundle-3: hash 0x80000000 ~ 0xBFFFFFFF (含 Topic C)
   Bundle-4: hash 0xC0000000 ~ 0xFFFFFFFF (含 Topic D)

Bundle 1~4 由不同 Broker 拥有,负载自动均衡。
当某个 Broker 压力过大,Load Manager 会触发 Bundle 拆分/迁移。
```

**核心类**:`org.apache.pulsar.broker.loadbalance.BundleData`,`ModularLoadManagerImpl`。

### 4.3 关键源码类索引(Broker)

| 类 | 路径 |
| --- | --- |
| `PulsarService` | `pulsar-broker/src/main/java/org/apache/pulsar/broker/PulsarService.java` |
| `PersistentTopic` | `pulsar-broker/src/main/java/org/apache/pulsar/broker/service/persistent/PersistentTopic.java` |
| `ManagedLedgerImpl` | `managed-ledger/src/main/java/org/apache/pulsar/managedledger/impl/ManagedLedgerImpl.java` |
| `ManagedCursorImpl` | `managed-ledger/src/main/java/org/apache/pulsar/managedledger/impl/ManagedCursorImpl.java` |
| `BookKeeperClientFactory` | `pulsar-broker/src/main/java/org/apache/pulsar/broker/bookkeeper/BookKeeperClientFactoryImpl.java` |

---

## 5. 主题(Topic)与订阅(Subscription)模型

### 5.1 四种订阅模式

这是 Pulsar 比 Kafka 更灵活的地方。Kafka 只有"一个 Consumer Group 一份副本",Pulsar 支持**同一 Topic 上多种订阅类型并存**。

```
Topic: stock-prices
┌──────────────────────────────────────────────────────────────┐
│   Producer ──▶ [Partition-0, Partition-1, Partition-2]       │
│                    │     │      │                             │
│   ┌────────────────┼─────┼──────┼───────────────┐             │
│   │ Subscription A │ Exclusive (默认, 等同 Kafka)│             │
│   │   msg-1, msg-2 │...只被 A1 消费             │             │
│   ├────────────────┼───────────────────────────┤             │
│   │ Subscription B │ Shared(共享,轮询)          │             │
│   │   msg-1→B1, msg-2→B2, msg-3→B1           │             │
│   ├────────────────┼───────────────────────────┤             │
│   │ Subscription C │ Failover(灾备)             │             │
│   │   主 C1 处理, C1 挂则 C2 接管             │             │
│   ├────────────────┼───────────────────────────┤             │
│   │ Subscription D │ Key_Shared(按 key 哈希分)   │             │
│   │   key=A→D1, key=B→D2, 相同 key 顺序消费   │             │
│   └────────────────┴───────────────────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

**订阅类型对比**:

| 类型 | 顺序性 | 多个 Consumer | 典型场景 |
| --- | --- | --- | --- |
| **Exclusive**(默认) | ✅ 全顺序 | ❌ 不允许多个 | 类 Kafka,流式处理 |
| **Failover** | ✅ 全顺序 | ✅ 主备 | 高可用队列 |
| **Shared** | ❌ 不保证 | ✅ 负载均衡 | 任务队列(每个任务一次) |
| **Key_Shared** | ✅ 同 key 顺序 | ✅ 哈希分配 | 订单按用户 ID 哈希,保证同用户消息顺序 |

### 5.2 Cursor(消费位置)

Pulsar 的 Cursor = Kafka 的 Offset,但更灵活:

- 每个 Subscription 有自己的 Cursor。
- Cursor **持久化到 BookKeeper**(`managed-ledger` Topic)。
- 可以**重置、回放、跳到位点**。

```
Topic: orders
   Partition-0 [msg0, msg1, msg2, msg3, msg4, msg5]

Subscription A (Exclusive):
   Cursor-A → entryId=5 (读到第 5 条)
   Broker 重启后从 entryId=6 开始读

Subscription B (Shared):
   Cursor-B → entryId=5 (B1 已读到 5)
   B2 从 entryId=6 开始读
   B1 和 B2 按 ack 顺序轮询拿

Subscription C (Key_Shared):
   key=order123 总是到 C1
   key=order456 总是到 C2
   同 key 顺序保证
```

**核心类**:`ManagedCursorImpl#asyncReadEntries`。

### 5.3 主题分类

```
Pulsar 主题
├── 持久主题(Persistent)
│   └── 数据写入 BookKeeper,持久化
├── 非持久主题(Non-Persistent)
│   └── 数据不写入磁盘,直接扇出到订阅者
└── 分区主题
    └── 一个 Topic N 个 Partition(默认 0)
        └── Partition 自动分配到不同 Broker
```

---

## 6. 与 Kafka 的对比

### 6.1 架构对比

| 维度 | Kafka | Pulsar |
| --- | --- | --- |
| **架构** | 存算一体(Broker 强耦合存储) | 存算分离(Broker 无状态) |
| **扩容** | 加 Broker 触发 Partition 迁移 | 加 Broker 自动承接 Bundle |
| **存储** | 强依赖本地磁盘 | 共享 BookKeeper + S3 冷数据 |
| **元数据** | KRaft / ZK | ZK + 支持 KRaft 化(KOP) |
| **运维** | 单系统 | 两套(Broker + Bookie) |

### 6.2 功能对比

| 能力 | Kafka | Pulsar |
| --- | --- | --- |
| **核心模型** | Partition Log | Topic + Subscription(4 种) |
| **顺序保证** | 分区内 | 分区内 + Key_Shared |
| **多订阅** | 多 Consumer Group | 多 Subscription(更灵活) |
| **事务** | ✅(PID + epoch) | ✅(AckGroup,较弱) |
| **压缩** | ✅(log.cleanup.policy=compact) | ✅(Topic 级别压缩) |
| **Schema Registry** | ✅ Confluent Schema | ✅(原生内置) |
| **延迟队列** | 第三方插件 | ✅(`deliverAt`) |
| **地理复制** | MirrorMaker 2 | ✅(内置 Geo-Replication) |
| **Function 计算** | Kafka Streams(需额外部署) | ✅(内置,函数即部署) |
| **协议** | Kafka Wire Protocol | Pulsar Binary Protocol |

### 6.3 性能对比(参考)

| 场景 | Kafka 3.7 | Pulsar 3.x |
| --- | --- | --- |
| 单 Topic 峰值吞吐 | 100 万 msg/s | 60 万 msg/s |
| 单 Partition 延迟 | 5~15 ms | 10~30 ms |
| 万级 Topic | 困难(元数据膨胀) | ✅ 优秀 |
| 弹性扩缩容 | 慢(数据迁移) | 快(无状态) |

### 6.4 选型决策

```
选 Pulsar 的场景:
   ✅ 需要 **10 万级 Topic**(微服务事件总线、IoT 设备)
   ✅ 需要 **存算分离**(云原生,降低存储成本)
   ✅ 需要 **多订阅灵活模型**(同一 Topic 给多业务共享)
   ✅ 需要 **地理复制**(跨 Region 数据同步)
   ✅ 需要 **轻量计算**(Pulsar Functions)

选 Kafka 的场景:
   ✅ 已有 Kafka 生态,迁移成本大
   ✅ 单 Topic 极限吞吐高(>100 万 msg/s)
   ✅ 需要 **Kafka Streams** 复杂状态计算
   ✅ 团队对 Kafka 运维经验丰富
   ✅ 需要 **Confluent Schema Registry / KSQL**
```

### 6.5 性能差异的根本原因

**Kafka 的优势**:
- 单 Broker 协议栈轻量,Producer → Leader 直连。
- Partition 切分=水平扩展,无中心路由。
- **Page Cache + sendfile 极致优化**。

**Pulsar 的代价**:
- Producer → Broker → Bookie,**两跳网络**。
- Broker 充当"翻译器",有额外 CPU 开销。
- 写流程:`Journal fsync + 副本复制`,比 Kafka 写 Page Cache 慢。
- **收益**:扩展性、灵活性、多订阅、冷热分层。

---

## 7. Pulsar Functions —— 轻量计算

### 7.1 三种部署模式

```
Pulsar Functions
├── Process Mode(默认)
│   └── 在 Broker 进程内启动一个 Function 线程
│       └── 适合轻量、低资源消耗场景
│
├── Thread Mode
│   └── 在 Broker 内分配独立线程
│       └── 适合中等吞吐
│
└── Kubernetes / Runtime Mode
    └── Function 独立 Pod 部署
        └── 适合重计算、隔离
```

### 7.2 Function 编程模型

```java
import org.apache.pulsar.functions.api.Context;
import org.apache.pulsar.functions.api.Function;

public class ExclamationFunction implements Function<String, String> {
    @Override
    public String process(String input, Context context) {
        return input + "!";
    }
}

// 部署 CLI
// pulsar-admin functions create \
//   --tenant public \
//   --namespace default \
//   --name exclamation \
//   --className ExclamationFunction \
//   --inputs persistent://public/default/source-topic \
//   --output persistent://public/default/sink-topic
```

### 7.3 Source / Sink / Function 三件套

```
Source:外部系统 → Pulsar
   ├── Kafka Source
   ├── MySQL CDC Source (Debezium)
   ├── JDBC Source (轮询)
   └── 自定义 Source

Function:对消息做转换
   ├── Window (滑动/滚动/会话)
   ├── Filter
   ├── Aggregate
   └── State Store (有状态计算)

Sink:Pulsar → 外部系统
   ├── Kafka Sink
   ├── JDBC Sink (写 MySQL)
   ├── HDFS / Iceberg Sink
   └── ES Sink
```

**核心类**:`org.apache.pulsar.functions.api.Function`,`SourceContext`,`SinkContext`。

### 7.4 Function vs Flink vs Kafka Streams

| 维度 | Pulsar Functions | Flink | Kafka Streams |
| --- | --- | --- | --- |
| **定位** | 轻量级 ETL | 大数据流计算 | 中等状态流计算 |
| **状态** | 内存 / RocksDB | RocksDB 大状态 | RocksDB |
| **窗口** | 简单(滚动/滑动) | 全功能(Event/Session/Process) | 全部 |
| **Exactly-Once** | ✅(部分) | ✅ | ✅ |
| **运维** | 与 Pulsar 一体 | 独立集群 | 与 Kafka 一体 |
| **适用** | 简单转换、路由 | 复杂流处理 | Kafka 生态内计算 |

---

## 8. 关键源码类索引

| 模块 | 核心类 | 路径 |
| --- | --- | --- |
| **BookKeeper 客户端** | `BookKeeper` | `bookkeeper-server/src/main/java/org/apache/bookkeeper/client/BookKeeper.java` |
| Bookie 服务 | `BookieServer` | `bookkeeper-server/src/main/java/org/apache/bookkeeper/server/service/BookieServer.java` |
| Ledger 抽象 | `LedgerHandle` | `bookkeeper-server/src/main/java/org/apache/bookkeeper/client/LedgerHandle.java` |
| **Pulsar Broker** | `PulsarService` | `pulsar-broker/src/main/java/org/apache/pulsar/broker/PulsarService.java` |
| Topic | `PersistentTopic` | `pulsar-broker/src/main/java/org/apache/pulsar/broker/service/persistent/PersistentTopic.java` |
| Managed Ledger | `ManagedLedgerImpl` | `managed-ledger/src/main/java/org/apache/pulsar/managedledger/impl/ManagedLedgerImpl.java` |
| Consumer | `ConsumerImpl` | `pulsar-client/src/main/java/org/apache/pulsar/client/impl/ConsumerImpl.java` |
| Producer | `ProducerImpl` | `pulsar-client/src/main/java/org/apache/pulsar/client/impl/ProducerImpl.java` |
| Functions | `Function` | `pulsar-functions/api-java/src/main/java/org/apache/pulsar/functions/api/Function.java` |

**源码阅读路线**:
1. `ProducerImpl.sendInternal` → `OpSendMsg` → `BookKeeper.asyncAddEntry`
2. `ConsumerImpl.receiveAsync` → `ManagedLedger.asyncReadEntries` → `BookKeeper.asyncReadEntries`
3. `PersistentTopic.addSubscription` → `ManagedCursor.initialize` → `BookKeeper.openLedger`

---

## 9. 生产配置基线(Pulsar 3.x)

### 9.1 Broker 配置

```properties
# conf/broker.conf
clusterName=my-cluster
zookeeperServers=zk1:2181,zk2:2181,zk3:2181
configurationStoreServers=zk1:2181,zk2:2181,zk3:2181
webServicePort=8080
brokerServicePort=6650

# 内存
maxMessageSize=10485760                  # 10MB
messageExpirationCheckIntervalInMinutes=5
managedLedgerCacheSizeMB=2048            # 2GB 读缓存
managedLedgerDefaultEnsembleSize=3       # Bookie Ensemble = 3
managedLedgerDefaultWriteQuorum=3        # 写副本数
managedLedgerDefaultAckQuorum=2          # ack 副本数
managedLedgerDefaultMarkDeleteRateLimit=0.1

# 订阅
subscriptionExpirationTimeMinutes=0       # 永不过期
subscriptionRedeliveryCount=3
```

### 9.2 Bookie 配置

```properties
# conf/bookie.conf
bookiePort=3181
zkServers=zk1:2181,zk2:2181,zk3:2181
journalDirectory=/data/bookie/journal
ledgerDirectories=/data/bookie/ledgers

# 写盘
journalSyncData=true                     # 强一致
journalFlushWhenQueueEmpty=true
flushInterval=100                        # ms

# 磁盘
freeDiskSpaceLowWaterMark=0.05           # 5% 警告
freeDiskSpaceHighWaterMark=0.02          # 2% 拒绝写入

# 读
readAheadCacheEnable=true
readAheadCacheSizeBytes=10485760         # 10MB
```

### 9.3 客户端配置(Producer/Consumer)

```java
// Producer
PulsarClient client = PulsarClient.builder()
    .serviceUrl("pulsar://broker1:6650,broker2:6650")
    .connectionTimeout(2, TimeUnit.SECONDS)
    .build();

Producer<byte[]> producer = client.newProducer()
    .topic("persistent://public/default/orders")
    .batchingMaxPublishDelay(20, TimeUnit.MILLISECONDS)
    .batchingMaxMessages(1000)
    .compressionType(CompressionType.ZSTD)
    .sendTimeout(30, TimeUnit.SECONDS)
    .blockIfQueueFull(true)
    .maxPendingMessages(10000)
    .create();
```

```java
// Consumer(Key_Shared 模式)
Consumer<byte[]> consumer = client.newConsumer()
    .topic("persistent://public/default/orders")
    .subscriptionName("order-processor")
    .subscriptionType(SubscriptionType.Key_Shared)
    .keySharedPolicy(KeySharedPolicy.autoSplitHashRange())
    .receiverQueueSize(1000)
    .ackTimeout(60, TimeUnit.SECONDS)
    .subscribe();
```

---

## 10. 专家面试题

> **Q1**:**Pulsar 为什么选择存算分离?有什么代价?**
>
> **参考答案**:
> - **好处**:Broker 无状态,扩容快;Bookie 共享存储,故障域小;支持 S3 分层冷存储。
> - **代价**:写路径多一跳网络,延迟比 Kafka 高 5~20ms;运维两套系统;依赖 ZK 做元数据。
> - **适用**:Topic 数量大(>1000)、需要云原生弹性的场景。

> **Q2**:**Pulsar 的 Key_Shared 订阅与 Kafka 的 Partition + Key 路由有什么本质区别?**
>
> **参考答案**:
> - **Kafka**:Producer 用 key 哈希到 Partition,Consumer 拉取整个 Partition(自己保证 key 内顺序)。
> - **Pulsar**:Key_Shared 在 Broker 端做 key 哈希分片,**消息不需要全 Partition 拉到同一 Consumer**。
> - **优势**:Pulsar 可以在不影响顺序的前提下,**动态增加 Consumer**(Kafka 加 Consumer 必须等 Rebalance)。
> - **代价**:Broker 路由开销,延迟增加。

> **Q3**:**BookKeeper 的 Ledger 大小怎么设置?**
>
> **参考答案**:
> - **小 Ledger**(1MB):写入次数多,频繁开闭,Bookie GC 压力大。
> - **大 Ledger**(1GB):单个 Ledger 副本多,故障恢复慢。
> - **推荐**:100MB ~ 1GB。
> - **生产**:根据 Topic 写入速率计算:`LedgerSize / 写入速率 = 单 Ledger 持续时间`(推荐 5~30 分钟)。

> **Q4**:**Pulsar 的 Cursor 和 Kafka 的 Offset 有什么不同?**
>
> **参考答案**:
> - **Kafka Offset**:整数值,单调递增,按 (topic, partition, group) 维度存储在 `__consumer_offsets` Topic。
> - **Pulsar Cursor**:存 `(ledgerId, entryId, batchIndex)`,按 (topic, subscription) 维度持久化在 BookKeeper。
> - **优势**:Cursor 可以重置到任意历史时间戳(`seek(timestamp)`),Kafka 需要先查 `__consumer_offsets` 的 timestamp 索引。
> - **劣势**:Cursor 持久化写 BookKeeper 带来额外 IO。

> **Q5**:**生产上怎么决定用 Pulsar 还是 Kafka?**
>
> **参考答案**:
> - **Topic 数量 > 10 万**:Pulsar(共享存储,元数据少)。
> - **极限单 Topic 吞吐 > 100 万 msg/s**:Kafka。
> - **需要地理复制**:Pulsar(内置)、Kafka(MirrorMaker 2 复杂)。
> - **存算分离 + 冷数据归档**:Pulsar / AutoMQ。
> - **已有 Kafka 生态(KStreams/Connect/Schema)**:Kafka 改造成本大。

---

## 11. 生产实战清单

- [ ] **Step 1:部署单机 Pulsar** — 用 `bin/pulsar standalone` 启动单节点。
- [ ] **Step 2:部署 BookKeeper 集群** — 3 节点 Bookie + 3 节点 ZK,验证元数据高可用。
- [ ] **Step 3:四种订阅模式测试** — 创建 Topic,分别用 Exclusive / Shared / Failover / Key_Shared 订阅,观察消息分发。
- [ ] **Step 4:Cursor 操作** — `seek` 到历史时间戳、删除 Subscription、观察 ManagedLedger 状态。
- [ ] **Step 5:Function 部署** — 写一个简单 Function,部署到 Broker,验证输入输出。
- [ ] **Step 6:分层存储配置** — 集成 S3,验证冷数据自动上传。
- [ ] **Step 7:性能对比** — Kafka vs Pulsar 同样硬件配置,跑 100 万 msg/s 对比延迟。
- [ ] **Step 8:故障演练** — kill Bookie,看 Broker 写入是否阻断;重启 Bookie,验证恢复。
- [ ] **Step 9:地理复制** — 部署两个集群,配置 Geo-Replication。
- [ ] **Step 10:监控接入** — Prometheus Exporter + Grafana,出 Pulsar 看板。

**完成标志**:能在 30 分钟内解释清楚"Pulsar 为什么是存算分离"以及"BookKeeper Ledger 是什么"。

---

## 12. 一句话总结

> **Pulsar 不是一个"Kafka 替代品",而是"云原生时代的下一代消息系统"。** 它用存算分离换来了弹性和多订阅灵活性,但代价是延迟更高、运维更复杂。选型的核心是判断"扩展性 vs 极限吞吐"哪个更重要。

---

**下一章预告**:**[04-Kubernetes 基础与大数据 on K8s](./04-k8s-basics.md)** —— Pod/Deployment/Service/ConfigMap、PV/PVC、Operator 模式,从存算分离视角重新理解 K8s。