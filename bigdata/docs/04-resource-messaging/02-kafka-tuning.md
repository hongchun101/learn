# 02 · Kafka 调优与生产陷阱(3.7/4.0)

> **本章定位**:从"会用 Kafka"升级到"会调 Kafka"——Page Cache、磁盘 IO、JVM、Broker 参数、Producer/Consumer 参数、Replicator 调优、KIP 改进路线。
>
> **版本基线**:Kafka 3.7(KRaft 模式稳定)+ Kafka 4.0(已 GA)。
>
> **学习时长**:建议 10 学时(理论 3 + 实战 6 + 源码阅读 1)。

---

## 1. 调优的三个层次

```
Kafka 调优的层次结构
┌────────────────────────────────────────────────────┐
│ Layer 3: 架构层调优                                 │
│   ├── Partition 数规划                              │
│   ├── 副本数与 ISR 配置                             │
│   └── Topic 拆分策略                                │
├────────────────────────────────────────────────────┤
│ Layer 2: 应用层调优                                 │
│   ├── Producer: acks / idempotence / batch          │
│   ├── Consumer: poll 模型 / offset 提交             │
│   └── 序列化: zstd / lz4 / protobuf                 │
├────────────────────────────────────────────────────┤
│ Layer 1: 系统层调优                                 │
│   ├── Page Cache (OS 内存)                          │
│   ├── 磁盘 IO (XFS / readahead / IO scheduler)      │
│   └── 网络 (TCP buffer / MTU / IRQ 亲和)            │
└────────────────────────────────────────────────────┘
```

**调优的"二八法则"**:**80% 的性能问题源自系统层**(Page Cache、磁盘),只有 20% 需要动 Kafka 参数。先排查 OS 层!

---

## 2. Page Cache 调优(最关键)

### 2.1 为什么 Page Cache 比 JVM Heap 还重要?

Kafka 写入路径:**直接写 Page Cache → 由 Kernel flush 到磁盘**。读路径:**直接从 Page Cache 读**(命中则零 IO)。

```
Producer 写入数据流:
Producer
   ↓ send (网络)
Broker Page Cache (内存,顺序写)
   ↓ 异步 flush (后台线程 / OS 策略)
Disk (.log 文件)
   ↑
Consumer 读取 (优先 Page Cache,未命中再读盘)
```

**关键事实**:
- Kafka **不直接写磁盘**,只写 Page Cache,由 `log.flush.interval.ms` 或 OS dirty ratio 控制落盘。
- Consumer **优先读 Page Cache**,命中率 90%+ 时几乎零延迟。

### 2.2 Page Cache 大小计算

```
Page Cache 估算公式:
   Available RAM for Page Cache
   = Total RAM - JVM Heap - System Reserved - Other Processes

   建议:Page Cache ≥ log.dirs 总磁盘的 25~50%
         (即"活跃数据"全部进内存)

示例(单台 64GB 内存,3 块 4TB 磁盘):
   JVM Heap: 6GB
   OS + Others: 2GB
   Page Cache 可用: ~56GB
   log.dirs 总容量: 12TB (实际使用 4TB 左右)
   比例: 56GB / 4000GB = 1.4% ← 严重不足!
```

**生产建议**:
- 内存 ≥ `log.dirs 活跃数据量 / 2`(假设一半数据是活跃的)。
- 64GB 内存能撑 30~60TB 日增量的活跃数据。
- **如果内存不够** → 升级机器(不要想着加磁盘就能撑)。

### 2.3 OS 脏页刷新参数

```bash
# /etc/sysctl.conf

# 脏页比例(默认 20,推荐保持)
vm.dirty_ratio = 20                    # 内存最大脏页百分比
vm.dirty_background_ratio = 10          # 后台 flush 阈值
vm.dirty_expire_centisecs = 3000       # 30 秒后必须 flush
vm.dirty_writeback_centisecs = 100     # 100ms 检查一次

# 透明大页(Kafka 推荐禁用)
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo never > /sys/kernel/mm/transparent_hugepage/defrag
```

**`vm.dirty_ratio` 的取舍**:
- **太低**(5%):磁盘 IO 频繁,顺序写退化为随机 IO,吞吐下降。
- **太高**(50%):崩溃时丢数据风险大(最多丢 `dirty_ratio * RAM` 的数据)。
- **Kafka 推荐**:`dirty_ratio=20, dirty_background_ratio=10`。

### 2.4 监控 Page Cache

```bash
# 查看 Page Cache 命中率
sar -B 1 5
# 输出:pgscank/s, pgscand/s, pgsteal/s

# 更直观的工具:cachestat(perf-tools)
./cachestat 1
#  HITS   MISSES  DIRTIES  RATIO  BUFFERS_MB  CACHE_MB
# 985432  1234    0        99.87% 4           25678

# vmstat
vmstat 1
# 关注:bi (blocks in, 块设备读), bo (blocks out, 块设备写)
```

**核心指标**:`cache hit ratio = hits / (hits + misses) > 95%`。

---

## 3. 磁盘 IO 调优

### 3.1 文件系统选择

| 文件系统 | Kafka 适用性 | 备注 |
| --- | --- | --- |
| **XFS** | ✅ 推荐 | 高并发、多线程写性能优,默认 ext4 的 1.5 倍 |
| ext4 | ⚠️ 可用 | 调优后性能可接受,但大数据量下碎片化 |
| ZFS | ❌ 不推荐 | ARC 缓存与 Linux Page Cache 冲突 |
| Btrfs | ❌ 不推荐 | 稳定性问题 |

```bash
# /etc/fstab 示例(XFS + noatime)
/dev/sdb1 /data1/kafka xfs defaults,noatime,nodiratime,allocsize=64m 0 0
```

### 3.2 磁盘调度器

```bash
# 查看当前调度器
cat /sys/block/sdX/queue/scheduler
# [none] mq-deadline kyber bfq

# Kafka 推荐:none (多队列 SSD)
echo none > /sys/block/sdX/queue/scheduler

# HDD 用 mq-deadline
echo mq-deadline > /sys/block/sdX/queue/scheduler
```

### 3.3 readahead 调优

```bash
# 顺序读优化(默认 128KB,推荐 4MB)
blockdev --setra 4096 /dev/sdX

# 查看
blockdev --getra /dev/sdX
```

### 3.4 多磁盘并行

```properties
# server.properties - 多块磁盘当独立 log.dir
log.dirs=/data1/kafka,/data2/kafka,/data3/kafka,/data4/kafka

# Kafka 按 Partition 轮询分配到不同目录
# 4 块独立磁盘的吞吐 ≈ 1 块磁盘的 4 倍(理论)
```

**生产建议**:**NVMe SSD + JBOD(Just a Bunch Of Disks)**,不要用 RAID 5/6(写惩罚太大)。**机械盘时代** 用 RAID 10 即可。

---

## 4. 网络调优

### 4.1 Socket Buffer

```properties
# server.properties
socket.send.buffer.bytes=1048576       # 1MB
socket.receive.buffer.bytes=1048576
```

```bash
# OS 层 /etc/sysctl.conf
net.core.rmem_max = 16777216          # 16MB
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.core.somaxconn = 4096              # listen backlog
net.core.netdev_max_backlog = 65536
```

### 4.2 TCP 参数

```bash
# /etc/sysctl.conf
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_timestamps = 0            # 关闭以省 CPU
net.ipv4.tcp_sack = 1
net.ipv4.tcp_no_metrics_save = 1
net.ipv4.tcp_mtu_probing = 1

# 连接跟踪
net.nf_conntrack_max = 1048576
```

### 4.3 网卡多队列与 IRQ 亲和

```bash
# 启用多队列网卡(默认通常已启用)
ethtool -L eth0 combined 8

# 查看 IRQ 分布
cat /proc/interrupts | grep eth0

# 设置 IRQ 亲和(用 tuned / irqbalance)
systemctl enable irqbalance
```

---

## 5. JVM 调优

### 5.1 GC 选择

**Kafka 推荐 G1GC**(默认)。ZGC/Shenandoah 在 4.0+ 已被官方支持(实验)。

```properties
# /opt/kafka/bin/kafka-server-start.sh 中 export KAFKA_HEAP_OPTS
export KAFKA_HEAP_OPTS="-Xms6g -Xmx6g"

# G1GC 参数
-XX:+UseG1GC
-XX:MaxGCPauseMillis=20
-XX:InitiatingHeapOccupancyPercent=35
-XX:G1NewSizePercent=30
-XX:G1MaxNewSizePercent=40
-XX:ParallelGCThreads=8
-XX:ConcGCThreads=2

# 调试 / 监控
-XX:+PrintGCDetails
-XX:+PrintGCDateStamps
-Xloggc:/var/log/kafka/gc.log
-XX:+UseGCLogFileRotation
-XX:NumberOfGCLogFiles=10
-XX:GCLogFileSize=100M
```

### 5.2 堆大小设置

**公式**:`Heap = (6~8GB)` 给 Kafka,其余给 Page Cache。

| 内存 | 推荐 Heap |
| --- | --- |
| 32 GB | 6 GB |
| 64 GB | 6–8 GB |
| 128 GB | 8–10 GB |
| 256 GB+ | 12–16 GB |

**为什么不加大堆**?Kafka 用堆存的是 Page Cache 的引用 + 批数据 + 元数据,**真正的数据在 Off-Heap(Page Cache)**。堆过大反而 GC 时间长。

### 5.3 监控 GC

```bash
# jstat 实时
jstat -gcutil <pid> 1000
# 关注:GCT (总 GC 时间), YGC/YGCT, FGC/FGCT

# 如果 FGC > 0,G1GC 已经在 STW,需要排查内存泄漏

# jmap 导出堆
jmap -histo:live <pid> | head -50

# async-profiler 火焰图
./profiler.sh -d 30 -f /tmp/flame.html <pid>
```

---

## 6. Broker 参数调优

### 6.1 存储参数

```properties
# ============ 存储相关 ============
log.segment.bytes=1073741824            # 1GB,默认值,推荐保持
log.segment.ms=604800000                # 7 天,推荐保持
log.retention.hours=72                  # 3 天保留,按业务调整
log.retention.bytes=-1                  # 无限大(仅按时间删)
log.cleanup.policy=delete               # 或 compact

# Index(默认即可)
log.index.size.max.bytes=10485760       # 10MB,索引文件最大大小
log.index.interval.bytes=4096           # 4KB 一个索引项

# 压缩相关(如果 log.cleanup.policy=compact)
log.cleaner.dedupe.buffer.size=134217728  # 128MB
log.cleaner.threads=2                     # 压缩线程数
log.cleaner.io.max.bytes.per.second=10485760  # 压缩 IO 上限
```

### 6.2 网络/线程参数

```properties
num.network.threads=8                   # 接收请求线程,通常 = CPU/2
num.io.threads=16                      # 处理 IO 线程,通常 = CPU 核数
background.threads=4                    # 后台任务线程
```

### 6.3 副本/复制参数

```properties
num.replica.fetchers=4                  # Follower 拉取线程,推荐 4
replica.fetch.min.bytes=1               # 拉取最小字节,触发立即返回
replica.fetch.max.bytes=1048576         # 拉取最大字节
replica.fetch.response.max.bytes=10485760  # 响应最大字节
replica.lag.time.max.ms=30000           # 30s 未同步视为掉队
replica.lag.max.messages=4000           # 备用,默认 4000
```

### 6.4 Group Coordinator 参数

```properties
offsets.topic.replication.factor=3      # __consumer_offsets 副本数
transaction.state.log.replication.factor=3  # __transaction_state 副本数
transaction.state.log.min.isr=2
offsets.load.buffer.size=5242880        # 加载 offset 缓存
group.initial.rebalance.delay.ms=3000   # 新 Consumer Group 延迟加入
group.max.session.timeout.ms=1800000    # 30min
group.min.session.timeout.ms=6000       # 6s
```

---

## 7. Producer 参数调优

### 7.1 关键参数矩阵

| 参数 | 推荐值 | 影响 |
| --- | --- | --- |
| `acks` | `all` | 可靠性 vs 延迟 |
| `enable.idempotence` | `true` | 防止重复,要求 acks=all |
| `max.in.flight.requests.per.connection` | `5` | 幂等模式下上限 5 |
| `retries` | `2147483647` | 几乎无限重试 |
| `delivery.timeout.ms` | `120000` | 总投递超时 |
| `compression.type` | `zstd` / `lz4` | 压缩比 vs CPU |
| `linger.ms` | `20` | 等待批量 |
| `batch.size` | `16384` | 16KB,触发立即发送 |
| `buffer.memory` | `67108864` | 64MB,总缓存 |
| `request.timeout.ms` | `30000` | 单请求超时 |

### 7.2 调优模板

```properties
# 高吞吐场景
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
compression.type=zstd
linger.ms=20
batch.size=65536                         # 64KB
buffer.memory=134217728                   # 128MB
```

```properties
# 低延迟场景
acks=1
enable.idempotence=false
max.in.flight.requests.per.connection=1
compression.type=lz4
linger.ms=0                              # 立即发送
batch.size=8192
```

### 7.3 关键源码位置

```java
// 1. ProducerConfig - 参数定义
// clients/src/main/java/org/apache/kafka/clients/producer/ProducerConfig.java

// 2. KafkaProducer.send() - 入口
// clients/src/main/java/org/apache/kafka/clients/producer/KafkaProducer.java

// 3. RecordAccumulator.append() - 批次管理
// clients/src/main/java/org/apache/kafka/clients/producer/internals/RecordAccumulator.java

// 4. Sender.sendProduceRequests() - 网络发送
// clients/src/main/java/org/apache/kafka/clients/producer/internals/Sender.java
```

---

## 8. Consumer 参数调优

### 8.1 关键参数

```properties
# 拉取参数
fetch.min.bytes=1                        # Broker 端最小返回字节(Producer 端 linger.ms 类似)
fetch.max.bytes=52428800                 # 50MB,单次最大拉取
fetch.max.wait.ms=500                    # 最长等待 500ms

# 处理参数
max.poll.records=500                     # 单次 poll 最大记录数
max.poll.interval.ms=300000              # 5min,处理超时(防止被踢出 Group)

# 会话参数
session.timeout.ms=45000                 # 45s,Broker 端会话超时
heartbeat.interval.ms=3000               # 3s,心跳间隔(< session.timeout/3)
group.max.session.timeout.ms=1800000     # 30min,Broker 端硬上限

# Offset
enable.auto.commit=false                 # 生产推荐手动
auto.commit.interval.ms=5000             # 自动提交间隔
auto.offset.reset=earliest              # earliest / latest / none

# 分配策略
partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor

# 事务隔离
isolation.level=read_committed           # 不读未提交事务
```

### 8.2 Consumer 调优的反模式

```
❌ 反模式 1:enable.auto.commit=true
   后果:处理一半崩溃 → 重启重复消费
   ✅ 改为 false,处理完手动 commit

❌ 反模式 2:max.poll.records=Integer.MAX_VALUE
   后果:单次拉取过多,处理超时触发 Rebalance
   ✅ 调小到 500~2000

❌ 反模式 3:不监控 lag
   后果:Consumer 滞后数小时才发现
   ✅ 接入 Burrow / Kafka Exporter

❌ 反模式 4:single-threaded 处理多条 Partition
   后果:CPU 打不满,吞吐受限
   ✅ 单 Consumer 多 Partition + 内部线程池
```

### 8.3 Consumer 线程模型

```
模式 1:每 Consumer 1 线程 (最简单)
   Consumer1 (T1, T2, T3)  ← 串行处理
   │
   └── poll → process → commit

模式 2:1 Consumer 多线程处理 (推荐,线程安全靠顺序 commit)
   Consumer (主线程)  ← poll + commit
      │
      ├── Worker T1
      ├── Worker T2
      └── Worker N (CPU 核数 - 1)

模式 3:多 Consumer 多线程 (按 Partition 分,互不重叠)
   Consumer1 (T1-T8)  ← Partition 0~3
   Consumer2 (T1-T8)  ← Partition 4~7
```

**源码**:`KafkaConsumer` 非线程安全,所有调用必须在同一线程。

---

## 9. Replicator 拉取优化

### 9.1 Follower 拉取流程

```
Follower Broker                   Leader Broker
       │                                │
       │ 1. send FetchRequest           │
       │   { topic, partition,          │
       │     fetchOffset, maxBytes,     │
       │     replicaId,                │  ← replicaId = -2 (Follower)
       │     isolationLevel }          │
       │ ──────────────────────────────▶│
       │                                │
       │                                │ 2. 验证:Follower Epoch
       │                                │ 3. 读取 LogSegment
       │                                │ 4. 构造 FetchResponse
       │                                │
       │ ◀──────────────────────────── │
       │ 5. 校验 CRC32C                │
       │ 6. 写入本地 Log               │
       │ 7. 更新 LEO / HW             │
```

### 9.2 拉取调优参数

```properties
# ============ Follower 端 ============
num.replica.fetchers=4                  # 拉取线程数(默认 1,推荐 ≥4)
replica.fetch.min.bytes=1               # 最小返回字节
replica.fetch.max.bytes=1048576         # 单次最大 1MB
replica.fetch.response.max.bytes=10485760  # 响应最大 10MB

# ============ Leader 端 ============
replication.fetch.min.bytes=1           # 与上对应,确保 Follower 拉得到数据
```

### 9.3 延迟副本(Lag Replica)处理

**监控指标**:
- `replica.lag.time.max.ms=30000`:超过 30s 视为掉队。
- `UnderReplicatedPartitions` JMX:实时 ISR < AR 的 Partition 数。

**运维动作**:
```bash
# 查看 Lag Replica
kafka-replica-verification.sh --broker-list broker1:9092 \
    --topic-white-list my-topic 2>/dev/null | grep "is in error"

# 手动从 ISR 移除
kafka-leader-election.sh --bootstrap-server broker1:9092 \
    --topic my-topic --partition 0 --election-type PREFERRED

# 增加 Follower 追赶线程
# (重启 Broker 配 num.replica.fetchers=8)
```

---

## 10. KIP 改进路线(KIP-500/KRaft 详解)

### 10.1 重要 KIP 概览

| KIP | 主题 | 版本 |
| --- | --- | --- |
| **KIP-500** | 移除 ZooKeeper,KRaft 模式 | 2.8 实验 → 3.3 GA → 4.0 唯一 |
| KIP-98 | 幂等 Producer + 事务 | 0.11 |
| KIP-129 | KTable / KStream 改进 | 0.11 |
| KIP-320 | KRaft 初版 | 2.8 |
| KIP-500 | KRaft GA | 3.3 |
| **KIP-848** | 新 Consumer Group 协议(Next Gen) | 3.7 实验 → 4.0 计划 GA |
| KIP-405 | 分层存储(Tiered Storage) | 3.6 实验 → 4.0 GA |
| **KIP-900** | 共享集群(SKR) | 未来 |
| KIP-429 | CooperativeStickyAssignor | 2.4 |
| KIP-776 | 移除 Scala 2.13 编译(纯 Java) | 4.0 |
| KIP-1034 | 移除 `auto.create.topics.enable` 默认值 | 4.0 |

### 10.2 KIP-500 KRaft 详解

```
KRaft 架构组件
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│   Controllers (KRaft Quorum, 默认 3 节点)                   │
│   ┌──────────┐    Raft Log    ┌──────────┐    ┌──────────┐ │
│   │ C0(Lead) │ ─────────────▶│ C1(Foll) │    │ C2(Foll) │ │
│   │          │               │          │    │          │ │
│   │  - Metadata│              │ 投票     │    │ 投票     │ │
│   │  - Epoch │               └──────────┘    └──────────┘ │
│   └────┬─────┘                                              │
│        │                                                    │
│        │ 控制面                                              │
│        ▼                                                    │
│   Brokers (可同时跑 Controller)                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│   │ Broker 0 │  │ Broker 1 │  │ Broker 2 │                  │
│   │(数据+控制)│  │(数据)     │  │(数据)     │                │
│   └──────────┘  └──────────┘  └──────────┘                  │
│                                                              │
│   __cluster_metadata (内部 Topic)                             │
│   - 持久化所有元数据                                          │
│   - 副本数 = controller.quorum.voters 数                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**关键参数**:
```properties
# ============ KRaft 关键配置 ============
process.roles=broker,controller              # 单节点同时跑
node.id=1                                    # 节点唯一 ID
controller.quorum.voters=1@broker1:9093,2@broker2:9093,3@broker3:9093
controller.listener.names=CONTROLLER
listeners=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
inter.broker.listener.name=PLAINTEXT
advertised.listeners=PLAINTEXT://broker1:9092

# 启动
./kafka-storage.sh format -t $(./kafka-storage.sh random-uuid) -c config/kraft/server.properties
./kafka-server-start.sh config/kraft/server.properties
```

**KRaft 优势对比**:
| 维度 | ZooKeeper 模式 | KRaft 模式 |
| --- | --- | --- |
| 元数据延迟 | 50~200 ms | 5~20 ms |
| 最大元数据 | ~100MB | ~10GB+ |
| 部署复杂度 | 2 套(Kafka + ZK) | 1 套 |
| Controller 切换 | 10s+(依赖 ZK 通知) | < 1s |
| 运维负担 | 高(需运维 ZK) | 低 |

### 10.3 KIP-848:Next Gen Consumer Group 协议

**核心变化**:
- 旧协议:`Consumer → Coordinator → Broker`,所有 Consumer 都要等到 Sync Group。
- 新协议:Consumer 直接向 Group Coordinator 发起 Join,Broker 端做分配决策。

```
旧协议(KIP-848 之前):
   Consumer 0 ──┐
   Consumer 1 ──┼──▶ GroupCoordinator ──▶ 分配决策 ──▶ Sync Group
   Consumer 2 ──┘

新协议(KIP-848):
   Consumer 0 ──▶ GroupCoordinator (server-side assignor)
   Consumer 1 ──▶   │
                    ▼
                  分配决策
                  ─────▶ Incremental Cooperative Response
```

**优势**:
- Rebalance 时间从 **秒级降到毫秒级**。
- 增量分配,只迁移必要的 Partition。
- Server 端策略,可自定义。

**生产建议**:Kafka 4.0 + KIP-848 默认启用,老版本可手动开启 `group.protocol=consumer`。

### 10.4 KIP-405:分层存储(Tiered Storage)

**动机**:Kafka 本地磁盘贵,需要把冷数据移到 S3/HDFS。

```
┌─────────────────────────────────────────────┐
│           分层存储架构                         │
│                                              │
│   ┌──────────────┐                           │
│   │  Local Disk  │ ← 热数据(最新 N 小时)     │
│   │  (Hot Tier)  │   读延迟 < 10ms           │
│   └──────┬───────┘                           │
│          │ 异步上传                            │
│          ▼                                    │
│   ┌──────────────┐                           │
│   │   S3/OSS/HDFS│ ← 冷数据(历史)           │
│   │  (Cold Tier) │   读延迟 100ms+          │
│   └──────────────┘                           │
│                                              │
│   Consumer 透明拉取,Broker 端按需 fetch      │
└─────────────────────────────────────────────┘
```

**配置**:
```properties
# broker 端(Kafka 4.0+)
remote.log.storage.system.enable=true
remote.log.storage.manager.class.name=org.apache.kafka.server.log.remote.storage.RemoteLogStorageManager
remote.log.metadata.manager.class.name=org.apache.kafka.server.log.remote.metadata.storage.TopicBasedRemoteLogMetadataManager
remote.log.storage.manager.impl.prefix.path=s3://my-bucket/kafka-remote-logs/
remote.log.retention.ms=604800000           # 7 天保留在 local
```

**关键类**:`RemoteLogStorageManager`,`RemoteLogSegment`,`RemoteStorageThread`。

---

## 11. 性能基准与监控

### 11.1 性能基准(Benchmark)

**生产环境参考**(基于 5 台 16C/64G/4TB NVMe 集群):

| 场景 | 吞吐 | 延迟 |
| --- | --- | --- |
| Producer(1KB JSON,acks=1) | 200 万 msg/s | 2 ms |
| Producer(1KB JSON,acks=all) | 80 万 msg/s | 8 ms |
| Producer(10KB Protobuf,zstd) | 50 万 msg/s | 15 ms |
| Consumer(单 Consumer Group) | 150 万 msg/s | 5 ms |
| End-to-End (Producer→Consumer) | 60 万 msg/s | 25 ms |

### 11.2 关键 JMX 指标

```
# Producer 端
kafka.producer:type=producer-metrics,client-id=*
   - record-send-rate          # 发送速率(msg/s)
   - request-latency-avg       # 请求延迟(ms)
   - batch-size-avg            # 平均批量大小
   - record-queue-time-avg     # 队列等待时间(ms)
   - compression-rate-avg      # 压缩率

# Consumer 端
kafka.consumer:type=consumer-fetch-manager-metrics,client-id=*,topic=*
   - records-lag-max           # 最大 lag
   - fetch-rate                # 拉取速率
   - fetch-latency-avg         # 拉取延迟

# Broker 端
kafka.server:type=BrokerTopicMetrics,name=*
   - MessagesInPerSec          # 写入速率
   - BytesInPerSec / BytesOutPerSec
kafka.controller:type=ControllerStats,name=*
   - LeaderElectionRateAndCount
kafka.server:type=ReplicaManager,name=*
   - UnderReplicatedPartitions
```

### 11.3 监控栈搭建

```yaml
# docker-compose.yml 简化版
version: '3'
services:
  kafka-exporter:
    image: danielqsj/kafka-exporter:latest
    command:
      - --kafka.server=broker1:9092
      - --web.listen-address=:9308
    ports:
      - "9308:9308"

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
```

**Grafana 推荐看板**:Confluent 官方 `kafka.json`、`Kafka Exporter Overview`。

---

## 12. 专家面试题

> **Q1**:**Kafka 的 Page Cache 命中率突然下降,排查思路是什么?**
>
> **参考答案**:
> 1. 检查 OS 内存是否被其他进程抢占(`free -m`)。
> 2. 检查是否有大查询/大 GC 发生(`jstat`)。
> 3. 检查磁盘 IO 是否被打满(`iostat -x`,`%util` > 80%)。
> 4. 检查 Topic 数量是否暴增(新 Topic 大批量写入,挤掉热数据)。
> 5. **临时缓解**:调整 OS dirty_ratio 触发更激进 flush;**长期方案**:扩容内存或迁移冷数据。

> **Q2**:**为什么 `acks=all` + `min.insync.replicas=2` 不一定能保证不丢消息?**
>
> **参考答案**:
> - **不能保证的场景**:Leader 在写入 ISR 但 Follower 收到前,Leader 进程被 kill -9(数据在 Page Cache 未 flush)。
> - **更可靠**:
>   1. 提高 `min.insync.replicas` 到 ≥ 副本数 - 1(如 3 副本设 2)。
>   2. 强制 Page Cache flush:`log.flush.interval.messages=1` + `log.flush.interval.ms=1000`(会极大降低吞吐)。
>   3. 使用 UPS + BBU(电池备份)防止断电丢数据。
> 4. 真正的金融级场景用 **WAL + 同步双写**。

> **Q3**:**Consumer Lag 越来越大,但 Consumer 处理逻辑很简单,可能是什么原因?**
>
> **参考答案**:
> 1. **MaxPollInterval 超时**:`max.poll.interval.ms=300000`,处理慢 → 触发 Rebalance → 重新消费。
> 2. **网络抖动**:Consumer 到 Broker 慢。
> 3. **Broker 端 Fetch 慢**:Leader 切换、磁盘 IO 满。
> 4. **Consumer 端反序列化慢**(Protobuf vs Avro)。
> 5. **下游写入慢**(数据库/S3 限流)。
> 6. **检查手段**:`kafka-consumer-groups.sh --describe --group <group>` 看每个 Partition 的 lag。

> **Q4**:**Kafka 4.0 的 KRaft 与 KIP-848 对运维有什么影响?**
>
> **参考答案**:
> 1. **不再需要 ZooKeeper**:部署简化,运维一个系统。
> 2. **元数据容量提升 10 倍**:支持百万级 Topic。
> 3. **KIP-848** 让 Rebalance 从秒级降到毫秒级。
> 4. **新监控点**:Controller Quorum 健康度、Raft Log 大小。
> 5. **升级路径**:3.3 → 4.0 渐进升级,先在测试集群。

> **Q5**:**生产上 Producer 用 `acks=all` 性能不够,如何调优?**
>
> **参考答案**:
> 1. **批量 + 压缩**:`batch.size=64KB`,`compression.type=zstd`,吞吐可提升 5 倍。
> 2. **Pipeline**:`max.in.flight.requests.per.connection=5`(幂等模式),减少 RTT 影响。
> 3. **就近部署**:Producer 与 Broker 同 Region。
> 4. **临时降级**:`acks=1` + 异步双写补偿表。
> 5. **分区扩展**:Topic 分区数从 12 扩到 60,并行度提升 5 倍。
> 6. **异步化**:业务侧用 Disruptor 队列解耦发送。

---

## 13. 生产实战清单

> **目标**:在 5 台 16C/64G/4TB NVMe 机器上,完成 Kafka 3.7 KRaft 模式部署、压测到 100 万 msg/s、故障演练后输出调优报告。

- [ ] **Step 1:OS 层调优** — 关闭 THP、调 dirty_ratio、设 readahead=4096、XFS noatime 挂载。
- [ ] **Step 2:网络调优** — 调 socket buffer、IRQ 亲和、TCP buffer。
- [ ] **Step 3:KRaft 集群部署** — 3 节点 KRaft,format + start,验证 Controller 选举。
- [ ] **Step 4:JVM 调优** — G1GC,Heap=8G,导出 GC 日志到 ELK。
- [ ] **Step 5:Broker 参数基线** — 写入 `server.properties`,重启。
- [ ] **Step 6:Producer 压测** — `kafka-producer-perf-test`,从 50 万 → 150 万 msg/s,记录延迟曲线。
- [ ] **Step 7:Consumer 压测** — 多 Group 拉取,观察 Page Cache 命中率。
- [ ] **Step 8:Lag 演练** — 故意停掉 Consumer 1 小时,重启后观察 catch-up 速度。
- [ ] **Step 9:故障演练** — kill -9 Leader,记录切换时间、Producer 阻塞时长。
- [ ] **Step 10:监控接入** — kafka_exporter → Prometheus → Grafana,出看板。
- [ ] **Step 11:文档沉淀** — 《调优参数基线》《故障 Runbook》《容量规划表》。

**完成标志**:能给团队讲清楚"为什么这台机器 Page Cache 不够""为什么 acks=all 配合 min.insync.replicas=2 仍然可能丢数据"。

---

## 14. 一句话总结

> **Kafka 调优的本质是"让数据尽量留在 Page Cache,让网络尽量复用,让 GC 尽量不发生"。** 参数调优是表象,理解 Page Cache / Zero Copy / Replica 协议才是根本。

---

**下一章预告**:**[03-Pulsar 与新一代消息系统](./03-pulsar.md)** —— BookKeeper 分层存储、Broker 无状态、Function 计算、与 Kafka 的本质差异。