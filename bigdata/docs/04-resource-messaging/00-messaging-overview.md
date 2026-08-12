# 00 · 消息总线总览与选型决策树

> **本章定位**:建立"消息/事件"领域的统一心智模型。看清 Kafka、Pulsar、RabbitMQ、RocketMQ、CDC、EventStreaming 的本质差异,以及顺序、重复、幂等、事务四大经典问题的解决范式。
>
> **读者画像**:已掌握分布式理论(CAP/BASE/共识),目标是把消息中间件从"会用 API"升级到"懂模型、能选型、能定位故障"。
>
> **学习时长**:建议 6 学时(理论 2 + 源码阅读 2 + 实战 2)。

---

## 1. 为什么先讲"分类"?

大数据领域的消息系统五花八门:ActiveMQ、RabbitMQ、RocketMQ、Kafka、Pulsar、TubeMQ、AutoMQ,再到 Flink CDC/Debezium、Schema Registry、Pravega,如果不先建立**分类坐标系**,你会陷入"工具列表"陷阱——背 API、背命令、调参数时完全没有理论支撑。

分类的三个核心维度:

1. **消息模型** —— 点对点 vs 发布订阅 vs 流式日志 vs CDC
2. **存储抽象** —— 队列(消息存完就丢) vs 日志(消息持久化、按 offset 读)
3. **消费语义** —— At-Most-Once / At-Least-Once / Exactly-Once

下面这张图是大数据消息系统的全貌:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        大数据消息系统分类全景                          │
├──────────────┬───────────────┬──────────────┬───────────────────────┤
│   传统 MQ    │   日志型 MQ   │     CDC      │   Event Streaming    │
│ (队列语义)   │ (Partitioned  │  (变更捕获)  │   (流处理语义)         │
│              │   Log)        │              │                       │
├──────────────┼───────────────┼──────────────┼───────────────────────┤
│ RabbitMQ     │ Kafka         │ Debezium     │ Pulsar                │
│ RocketMQ     │ Pulsar        │ Canal        │ Pravega               │
│ ActiveMQ     │ TubeMQ        │ Flink CDC    │ AutoMQ(共享存储)       │
│              │ AutoMQ        │ Maxwell      │ Redpanda              │
├──────────────┴───────────────┴──────────────┴───────────────────────┤
│  协议层: AMQP / MQTT / Kafka Wire Protocol / Pulsar Binary Protocol │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. 四类消息系统详解

### 2.1 传统 MQ(Queue-Based)

**核心特征**:消息被一个消费者消费后即标记为 ACK,Broker 可删除。**消费位置**由 Broker 维护(`deliveryTag` / `consumeOffset`)。

```
 Producer ──▶ [Queue] ──▶ Consumer A  (竞争消费,谁先抢到谁处理)
                  │
                  └──▶ Consumer B  (消息不会重复派发)
```

**代表**:
- **RabbitMQ**:Erlang 实现,AMQP 协议,Exchange/Binding/Routing Key 模型,适合**复杂路由**场景(订单按地区路由、延迟队列、死信)。
- **RocketMQ**:阿里开源,Java 实现,NameServer 轻量路由,CommitLog + ConsumeQueue 混合存储,适合**事务消息**、金融级消息。
- **ActiveMQ**:JMS 老牌实现,逐渐退出主流。

**优点**:路由灵活、消费确认语义完善。
**缺点**:扩展性受限(单队列分区上限受限于单节点);消费位置由 Broker 管理,Rebalance 时容易丢/重。

### 2.2 日志型 MQ(Log-Based / Partitioned Log)

**核心特征**:消息**永不删除**(按保留策略 TTL/Size 删除),**消费位置由 Consumer 自己管理**(提交 offset 到 `__consumer_offsets`)。这就是 Kafka 革命性的设计。

```
 Producer ──▶ [Partition 0: ░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] (append-only log)
                  │    offset 0 → 100 → 200 → 300
                  │
                  ├──▶ Consumer Group A (自己记 offset=100)
                  └──▶ Consumer Group B (自己记 offset=200,完全独立)
```

**代表**:
- **Kafka**:Scala/Java,Partition + Replica + ISR,生态最完善。
- **Pulsar**:Java,分层架构(BookKeeper 存数据,Broker 算协议),存算分离。
- **TubeMQ**:腾讯开源,主打低成本、单机百万级 Topic。
- **AutoMQ**:Kafka 协议兼容 + S3 共享存储,云原生降本利器。

**优点**:高吞吐(磁盘顺序写)、可重放(Offset 可回退)、水平扩展简单(加 Partition)。
**缺点**:不擅长复杂消息路由(没有 RocketMQ 的 18 个 Level 消息类型);消息顺序仅保证**分区内**。

### 2.3 CDC(Change Data Capture)

**核心特征**:**不是消息系统,是数据库变更捕获框架**,产出物是"变更事件流"。但生产上常与 Kafka 组合使用:

```
┌─────────┐    binlog/redo    ┌──────────┐   Debezium JSON   ┌────────┐
│  MySQL  │ ────────────────▶ │ Debezium │ ────────────────▶ │ Kafka  │
│ Oracle  │    解析 WAL       │  Canal   │     CDC 事件      │  Topic │
└─────────┘                   └──────────┘                   └────────┘
                                                                    │
                                                       ┌────────────┴────────────┐
                                                       ▼                         ▼
                                                  Flink CDC                  Iceberg/Hudi
                                                (流式 Join)                (湖仓写入)
```

**代表**:
- **Debezium**:基于 Kafka Connect,支持 MySQL/PG/MongoDB/Oracle/SQL Server。
- **Canal**:阿里开源,伪装 MySQL Slave 解析 binlog。
- **Flink CDC**:Flink 内置 Source Connector(基于 Debezium 二次封装),支持**无锁读取**(PG 已支持 MySQL 8.0 增量快照)。
- **Maxwell**:轻量级 binlog 解析,Java 实现。

**生产关注点**:
- **全量 + 增量**:Debezium 1.x 引入 Snapshot 阶段,先 `SELECT *` 全量再接 binlog。
- **Schema 演进**:Avro/Protobuf + Schema Registry 自动管理字段增删。
- **顺序性**:同一主键的变更**必须打到同一 Partition**,否则下游乱序。

### 2.4 Event Streaming(事件流平台)

**核心特征**:把"消息系统"+"流处理"+"长存储"三者合一。在 Kafka 生态里 = Kafka + Kafka Streams + Kafka Connect;在云原生里 = Pulsar + Flink。

```
┌──────────────────── Event Streaming Platform ────────────────────┐
│                                                                  │
│   Source ──▶ [Message Bus + Long-term Storage] ──▶ Sink         │
│                  ▲                              ▲                │
│                  │                              │                │
│           Stream Processing (Stateful)    Schema Registry         │
│           (Window/Join/Aggregate)         (Avro/JSON Schema)     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**代表**:Kafka 3.x(已弱化 Kafka Streams,推 KStream + ksqlDB)、Pulsar Functions、Redpanda。

**与传统 MQ 的根本区别**:消息不是"投递给消费者",而是"消费者订阅到某个 offset 自行拉取"。整个系统的核心抽象是**事件流**,不是消息队列。

---

## 3. 消息模型的三个本质抽象

无论哪类消息系统,底层都离不开这三个抽象:

| 抽象 | 含义 | Kafka 对应 | RabbitMQ 对应 | Pulsar 对应 |
| --- | --- | --- | --- | --- |
| **Topic / Queue** | 消息分类 | Topic | Queue + Exchange | Topic |
| **Partition / Shard** | 并行单位 | Partition(有序) | 无(Master Queue) | Partition(有序) |
| **Offset / Cursor** | 消费位置 | Offset(__consumer_offsets) | Delivery Tag(内存) | Cursor(__cursor订阅持久化) |

**核心区别**:
- **Topic 模型** vs **Queue 模型**:Topic 一条消息可被多个 Consumer Group 各自消费;Queue 一条消息只被一个消费者消费。
- **Push vs Pull**:Kafka/Pulsar 走 Pull(Consumer 主动 Fetch),吞吐可控、背压自然;RabbitMQ 走 Push(实时性高,但易压垮消费者)。
- **分区顺序**:Kafka/Pulsar 的 Partition 是天然有序的;RabbitMQ 单队列也顺序,但多队列无序。

```
            Kafka Topic 内部物理结构(简化)
   ┌─────────── Topic: orders ──────────────┐
   │                                          │
   │  Partition 0    [m0][m1][m2][m3][m4]      │  ← Replica-0/1/2 三副本
   │  Partition 1    [m0'][m1'][m2']          │
   │  Partition 2    [m0''][m1''][m2''][m3''] │
   │                                          │
   │  __consumer_offsets (内部 Topic)          │
   │    group1:partition0 → offset=4          │
   │    group1:partition1 → offset=2          │
   └──────────────────────────────────────────┘
```

---

## 4. 四大经典问题(顺序 / 重复 / 幂等 / 事务)

### 4.1 顺序性(Global Ordering)

**问题**:跨 Partition 不保证顺序;同 Partition 内**严格有序**(单写者)。

```
   ✅ 单 Partition:    P0 = [A, B, C, D]        严格有序
   ❌ 多 Partition:    P0 = [A, C]   P1 = [B, D] 全局无序
```

**业务解法**(以"同一订单的状态变更"为例):
1. **路由键保序**:发送时 `key=orderId`,Kafka 默认按 key 哈希到 Partition,同订单落到同分区。
2. **单分区单消费者**:把热点订单的 Partition 数设为 1,但要承担该 Partition 热点。
3. **业务侧排序**:Flink 用 `eventTime + watermark + keyBy` 在下游重排。

**源码类(Kafka)**:`org.apache.kafka.clients.producer.internals.DefaultPartitioner#partition`,根据 `(key.hashCode & Integer.MAX_VALUE) % numPartitions` 计算分区;无 key 时走 Round-Robin。

### 4.2 重复性(Duplicate Messages)

**根因**:网络重试、Broker 切换、Consumer Rebalance 会导致**至少一次(At-Least-Once)**投递。

**生产诱因**:
- Producer `acks=all` 但 ISR 收缩时,Leader 已写入但 Follower 未同步,Follower 升 Leader 后消息"看似丢了一次"。
- Consumer 处理完但未提交 Offset 就崩溃,下次从上次 Offset 重放。

**核心应对**:不是消除重复,而是**业务侧幂等**(见下节)。

### 4.3 幂等性(Idempotence)

**定义**:同一条消息被消费多次,业务结果与消费一次一致。

**三层防御**:

| 层级 | 手段 | 适用场景 |
| --- | --- | --- |
| **存储层** | 主键约束(`INSERT ... ON CONFLICT DO NOTHING`) | 写数据库 |
| **缓存层** | Redis `SETNX key value` | 抢单、抽奖 |
| **消息层** | Producer 幂等(`enable.idempotence=true`)+ 业务唯一键 | 全链路 |

**Kafka 幂等原理**(KIP-98,Kafka 0.11+):

```
   Producer                          Broker
   ┌──────────┐                       ┌──────────────┐
   │ PID=123  │ ─ InitProducerId ───▶ │              │
   │ seq=0..N │ ─ Produce(seq=5) ────▶ │ Check: (PID, │
   │          │ ◀─── ACK ───────────── │   partition, │
   │          │ ─ Produce(seq=5) ────▶ │   seq) 唯一? │
   │          │ ◀─── DuplicateError ── │   Yes→写入   │
   │          │                       │   No→丢弃    │
   └──────────┘                       └──────────────┘
```

**源码类**:`org.apache.kafka.clients.producer.internals.ProducerIdManager` 负责分配 PID;`RecordAccumulator#append` 给每条 Record 打 `(PID, epoch, sequenceNumber)` 三元组。

**事务原理**(KIP-98 扩展,Kafka 0.11+):
- `transactional.id` 唯一标识一个生产者事务会话(防僵尸)。
- `__transaction_state` 内部 Topic 持久化事务状态(由 TransactionCoordinator 协调)。
- 两阶段提交:`addPartitionsToTxn → Send → commitTransaction`。

### 4.4 分布式事务(Distributed Transaction)

**场景**:订单服务写订单 + 库存服务扣库存,要么都成功要么都失败。

**方案对比**:

| 方案 | 原理 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **2PC** | 协调者两阶段 | 强一致 | 阻塞、性能差 |
| **TCC** | Try-Confirm-Cancel 业务补偿 | 灵活 | 业务侵入大 |
| **本地消息表** | 业务表 + 消息表同库,异步投递 | 最终一致 | 需轮询 |
| **RocketMQ 事务消息** | Half Message + 回查 | 封装好 | 依赖 Broker |
| **Kafka 事务** | `initTransactions → commitTransaction` | Kafka 原生 | 仅限 Kafka 内部 |

**RocketMQ 事务消息流程**(经典):

```
   Producer                  Broker                Consumer
       │                        │                       │
       ├── Send(Half Msg) ────▶ │                       │
       │ ◀── Half OK ───────── │                       │
       ├── Execute Local Txn ───┐                       │
       ├── Commit/Rollback ────▶│                       │
       │     │                  │                       │
       │     └─ if 未知: 回查 ─▶ │                       │
       │                        │                       │
       │      [if Commit]       │                       │
       │     ── Real Msg ──────▶│ ──── Deliver ────────▶│
       │                        │                       │
```

**源码类(RocketMQ)**:`org.apache.rocketmq.client.producer.transaction.TransactionMQProducer`,回查线程 `TransactionalMessageBridge#resolveHalfMessage`。

---

## 5. 选型决策树

下面这张决策树覆盖了 90% 的大数据选型场景:

```
                        ┌─────────────────────┐
                        │ 你需要消息中间件吗? │
                        └──────────┬──────────┘
                                   │ Yes
                                   ▼
                    ┌──────────────────────────────┐
                    │ 核心诉求: 吞吐量 vs 复杂路由? │
                    └──────┬──────────────┬────────┘
                           │              │
                  高吞吐/批处理        复杂路由/事务
                           │              │
                           ▼              ▼
                   ┌──────────────┐    ┌──────────────┐
                   │ 日志型 MQ     │    │  传统 MQ      │
                   └──────┬───────┘    └──────┬───────┘
                          │                   │
                          ▼                   ▼
                ┌──────────────────┐    ┌────────────────┐
                │ 是否需要存算分离? │    │ 延迟队列?      │
                └─────┬────────┬───┘    └───┬────────┬───┘
                      │ Yes    │ No        │ Yes    │ No
                      ▼        ▼          ▼        ▼
                   Pulsar    Kafka      RabbitMQ   RocketMQ
                   AutoMQ    Redpanda   (插件)
```

### 5.1 按场景速选

| 场景 | 推荐 | 理由 |
| --- | --- | --- |
| **日志采集**(App → Kafka) | Kafka | 吞吐百万级、生态成熟 |
| **业务消息**(订单/支付) | RocketMQ | 事务消息、顺序消息完善 |
| **复杂路由**(按地区/类型) | RabbitMQ | Exchange 路由模型强 |
| **云原生存算分离** | Pulsar / AutoMQ | Broker 无状态、可独立扩缩 |
| **数据库同步** | Debezium + Kafka | 事实标准 |
| **流处理** | Kafka + Flink / Pulsar + Flink | 成熟方案 |
| **边缘 / IoT** | MQTT(EMQX) | 协议轻量、弱网适配 |

### 5.2 不要做的事

| 反模式 | 后果 |
| --- | --- |
| 把 Kafka 当 RabbitMQ 用(订阅单条消息) | 浪费 Kafka 的批量/顺序/重放能力 |
| 把 RabbitMQ 当 Kafka 用(堆积百万消息) | 内存爆、GC 抖动 |
| 用 Kafka 做请求/响应 RPC | 延迟高、没有 Request-Reply 语义 |
| Topic/Partition 数量过多(万级) | Controller 元数据广播风暴 |
| 开启 `auto.create.topics.enable=true` | 生产事故重灾区 |

---

## 6. 关键源码类索引

| 系统 | 核心类 | 路径(以 Kafka 3.7 为例) |
| --- | --- | --- |
| **Kafka Producer** | `KafkaProducer` | `clients/src/main/java/org/apache/kafka/clients/producer/KafkaProducer.java` |
| Kafka Broker | `KafkaServer` | `core/src/main/scala/kafka/server/KafkaServer.scala` |
| Kafka Controller | `KafkaController` | `core/src/main/scala/kafka/controller/KafkaController.scala` |
| **RocketMQ Broker** | `BrokerStartup` | `broker/src/main/java/org/apache/rocketmq/broker/BrokerStartup.java` |
| RocketMQ Producer | `DefaultMQProducer` | `client/src/main/java/org/apache/rocketmq/client/producer/DefaultMQProducer.java` |
| **Pulsar Broker** | `PulsarService` | `pulsar-broker/src/main/java/org/apache/pulsar/broker/PulsarService.java` |
| Pulsar BookKeeper Client | `BookKeeper` | `bookkeeper-server/src/main/java/org/apache/bookkeeper/client/BookKeeper.java` |
| **Debezium Core** | `EmbeddedEngine` | `debezium-core/src/main/java/io/debezium/embedded/EmbeddedEngine.java` |
| **Flink CDC Source** | `MySqlSource` | `flink-cdc-connectors/flink-cdc-source/src/main/java/com/ververica/cdc/connectors/mysql/debezium/DebeziumSource.java` |

**源码阅读顺序建议**:
1. Kafka:`KafkaProducer.send → RecordAccumulator.append → Sender.run`
2. RocketMQ:`DefaultMQProducer.send → MessageQueueSelector → BrokerOuterAPI`
3. Pulsar:`PulsarClient.send → ProducerImpl → ManagedLedgerImpl`

---

## 7. 生产配置速查

### 7.1 Kafka 3.7 最小生产配置

```properties
# broker 端(server.properties)
broker.id=1
log.dirs=/data1/kafka,/data2/kafka,/data3/kafka
num.network.threads=8
num.io.threads=16
log.segment.bytes=1073741824            # 1GB
log.retention.hours=72
num.replica.fetchers=4
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false

# producer 端
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
retries=2147483647
delivery.timeout.ms=120000
compression.type=zstd
linger.ms=20
batch.size=16384

# consumer 端
enable.auto.commit=false
isolation.level=read_committed
max.poll.records=500
session.timeout.ms=45000
heartbeat.interval.ms=3000
```

### 7.2 RocketMQ 5.x 关键配置

```properties
# broker.conf
brokerClusterName=DefaultCluster
brokerName=broker-a
brokerId=0
namesrvAddr=nameserver1:9876;nameserver2:9876
brokerRole=ASYNC_MASTER
flushDiskType=ASYNC_FLUSH
defaultTopicQueueNums=8
mapedFileSizeCommitLog=1073741824
```

---

## 8. 专家面试题

> **Q1(必问)**:**Kafka、RabbitMQ、RocketMQ、Pulsar 在"消息模型""存储模型""消费模型"上有什么本质区别?**
>
> **参考答案**:
> - **Kafka/Pulsar**:日志模型,消息持久化、消费位置由 Consumer 管理(提交 Offset/Cursor)。
> - **RabbitMQ**:队列模型,消费位置由 Broker 跟踪(Delivery Tag 内存维护)。
> - **RocketMQ**:混合模型,CommitLog(物理日志)+ ConsumeQueue(消费队列索引)。
>
> **加分项**:能说出"为什么 Kafka 不能做复杂路由"(因为消费由 Partition 决定,不是路由表)、"为什么 RabbitMQ 不适合做大吞吐日志"(因为消息被消费完即标记,无重放)。

> **Q2**:Kafka 的 **幂等 Producer** 为什么只能保证单 Producer 会话内的幂等?跨会话(Producer 重启)如何解决?
>
> **参考答案**:`enable.idempotence=true` 依赖 PID(Producer ID),重启后 PID 改变。生产上开启 **事务**(`transactional.id=固定值`),`transactional.id` 绑定 PID + epoch,Broker 通过 `__transaction_state` Topic 持久化状态,Fence 旧 PID。

> **Q3**:CDC 场景下,Debezium 全量阶段如何避免阻塞业务数据库?
>
> **参考答案**:
> - **Snapshot 阶段**:加全局读锁(MySQL)或 `REPEATABLE READ`(默认),避免 binlog 位点漂移。
> - **增量快照**(Debezium 1.6+):分片 Chunk 读取,每片记录 LSN,允许并发 DML。
> - **生产建议**:业务低峰期(凌晨 4–6 点)启动,或用 **Flink CDC 的无锁算法**(PG 已支持)。

> **Q4**:如果让你设计一个"既要顺序又要事务还要 100 万 TPS"的消息系统,你会怎么取舍?
>
> **参考答案**:
> - 顺序性 = **分区保证**,Partition = 物理并行单位,理论 TPS 与 Partition 数线性正相关。
> - 事务性 = **持久化成本**,需要 `__transaction_state` 多副本写入,会引入 30%–50% 延迟。
> - 100 万 TPS 单 Partition 极限约 10 万,需要至少 **10–20 个 Partition**,但跨分区顺序**无法保证**。
> - **取舍**:业务侧把"必须严格顺序"的范围缩到最小(订单维度 → 用户维度),其余字段放宽。

> **Q5**:**Kafka 为什么不建议用 auto.create.topics.enable=true?**
>
> **参考答案**:
> 1. 生产环境 Topic 应有显式声明(分区数、副本数、保留期),自动创建使用默认值(1 分区、1 副本)无法满足 SLA。
> 2. **客户端拼错 Topic 名**时会自动建一个同名 Topic,数据"消失"在错误的 Topic 里。
> 3. 大量自动创建的 Topic 会让 `__consumer_offsets` 与 `__transaction_state` 元数据膨胀,Controller 选举变慢。

---

## 9. 生产实战清单

> **目标**:在 5 台机器(16C/64G/2T)上独立交付一套**日均 100 亿条**消息的 Kafka 集群,并完成一次故障演练。

- [ ] **Step 1:集群规划** — 5 个 Broker,3 副本,Topic 默认 12 Partition,`min.insync.replicas=2`,预估磁盘 70% 使用率报警。
- [ ] **Step 2:网络拓扑** — 跨机架副本分配(Rack Awareness),保证单机架断电仍有两个副本可用。
- [ ] **Step 3:JVM 调优** — G1GC,`MaxGCPauseMillis=20`,`InitiatingHeapOccupancyPercent=35`,禁止 Swap。
- [ ] **Step 4:磁盘 IO** — `noatime`,XFS 文件系统(比 ext4 性能高 15%),`readahead=4096`。
- [ ] **Step 5:生产压测** — 用 `kafka-producer-perf-test` 跑 100 万 msg/s,观察 `request-latency-avg`、`record-send-rate`。
- [ ] **Step 6:消费监控** — Grafana 接入 JMX(Metricbeat/Confluent Telemetry),关注 `RecordsLagMax`、`UnderReplicatedPartitions`。
- [ ] **Step 7:故障演练** — `kill -9` 一个 Broker,观察 ISR 收缩、Controller 重新选举、Producer `acks=all` 阻塞时长(应 < 30s)。
- [ ] **Step 8:幂等验证** — 启动带 `enable.idempotence=true` 的 Producer,故意制造重复(代码层 retry),下游 MySQL 主键约束验证无重复。
- [ ] **Step 9:容量评估** — 每天 100 亿 × 平均 1KB = 10TB,3 副本 = 30TB/天,保留 3 天 ≈ 90TB,需 ≥ 100TB 裸盘。
- [ ] **Step 10:文档沉淀** — 写出《Kafka 集群运维手册》《Producer/Consumer 参数基线》《故障 Runbook》。

**完成标志**:能向团队完整讲清楚"为什么 Kafka 在我们场景下比 Pulsar 更合适"以及"Kafka 4.0 移除 ZooKeeper 后的 KRaft 模式对我们的影响"。

---

## 10. 一句话总结

> **消息中间件不是"装上就能用"的组件,而是"模型+存储+消费"三个维度的工程权衡。** 选型的本质,是在**吞吐 / 延迟 / 顺序 / 事务 / 路由**五个维度上做组合优化。

---

**下一章预告**:**[01-Kafka 架构与源码解析](./01-kafka-internals.md)** —— 从 Controller 选举到 LogSegment 索引,从 Zero Copy 到 Consumer Group Rebalance,逐行带你读 Kafka 3.7 的源码。