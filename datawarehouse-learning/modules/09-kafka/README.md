# 第09章 Kafka 消息队列与实时数据管道

本章介绍 Apache Kafka —— 实时数仓与流式处理的事实标准传输层。Kafka 既是消息中间件也是分布式持久化日志,为 Flink、Spark Streaming、Iceberg/Hudi/Paimon 的实时入湖提供可靠的数据通道。掌握 Kafka 核心概念、Producer/Consumer API、Offset 与 Consumer Group、Exactly-Once 语义、Kafka Connect、Schema Registry,并能用 Python 在本地对实时管道做端到端验证。

---

## ch01 消息队列基础

消息队列(MQ)是分布式系统中进程间异步通信的中间层:Producer 把消息发到 Broker,Consumer 按需拉取,二者解耦,各自独立伸缩与故障重启。传统 MQ(RabbitMQ、ActiveMQ)消费后即删除消息;Kafka 把消息建模成"持久化、追加写、可回放"的日志,同时具备消息队列、存储系统、流式数据源三重身份。

消息模型分点对点(P2P)与发布订阅(Pub/Sub)两种。P2P 每条消息只被一个消费者消费;Pub/Sub 每条消息被所有订阅者各消费一份。Kafka 采用分区多副本的发布订阅模型:同一 Topic 内不同分区的消息被不同 Consumer 消费,而同一分区对同一 Consumer Group 内只投递一次,兼具并行与广播能力。

消息队列的典型作用:①削峰填谷;②系统解耦,上下游通过 Topic 约定而非硬编码接口;③顺序保证,分区级别有序;④可重放,新业务可从历史 offset 重新订阅。Kafka 在这四点上都做了工业级强化。

实时数仓场景里,Kafka 通常处于"业务库 → 采集层 → 消息总线 → 实时计算 / 实时入湖"的链路。业务侧 MySQL Binlog 通过 Debezium 写入 Kafka 的 ods 主题,Flink SQL 订阅后做维表 join、聚合、写入 Paimon 的 dwd/dws 层。本章所有概念都为这条链路服务。

---

## ch02 Kafka 架构

Kafka 集群由若干 Broker 进程组成,Broker 通过 Zookeeper(早期)或 KRaft(Kafka 3.3+ 内置共识)实现集群元数据与 Leader 选举。Producer/Consumer 通过 TCP 与任意 Broker 建立连接,Bootstrap 返回集群元数据后,客户端直连对应 Leader 分区。

核心概念:**Topic** —— 消息逻辑分类;**Partition** —— Topic 的物理分片,有序追加写日志,并行度最小单位;**Offset** —— 分区内严格递增的消息序号;**Replica** —— 每个分区 1 个 Leader + N-1 个 Follower;**Controller** —— 元数据与 Leader 选举;**KRaft** —— 已可生产部署,降低对 ZK 的依赖。

Producer 流程:序列化 → Partitioner 选分区(默认 Key 哈希,空 Key 轮询)→ 攒批到 linger.ms/batch.size 阈值 → 单次请求发 Leader → 写 PageCache → 按 acks 等 Follower 同步。Consumer 流程:JoinGroup 加入 Consumer Group → Coordinator 触发 Rebalance 分配分区 → poll 拉取 → 处理后提交 Offset。

高吞吐来源:①顺序写磁盘,利用 OS PageCache;②零拷贝(sendfile)直送网卡;③批量压缩与批量网络请求;④分区并行消费。

---

## ch03 分区与副本

分区数是 Kafka 最重要的容量参数。同一 Consumer Group 内最多"分区数"个 Consumer 并行消费。分区过少限制吞吐,过多增加 Controller、FD、Rebalance 开销,经验公式"目标吞吐量 / 单分区吞吐 ≈ 分区数",生产预留 2~3 倍冗余。

分区策略:**Key 哈希分区** —— 相同 Key 落同一分区,保证同一用户订单有序;**轮询** —— Key 为空时均匀分布;**自定义分区器** —— 按地区、品类等业务字段分区。

副本机制提供高可用。每个分区 N 个副本(replication.factor),其中 1 个 Leader + N-1 个 Follower。Follower 持续拉取 Leader 日志,Lag 超阈值被踢出 ISR。Leader 永久下线时,Controller 从 ISR 中选新 Leader;若 ISR 无可用副本,根据 unclean.leader.election.enable 决定是否允许非 ISR 副本上线(后者会丢数据,生产通常关闭)。

ACK 机制:**acks=0** —— 不等响应,吞吐最高,可能丢;**acks=1** —— Leader 写入即 ACK,Leader 崩溃且 Follower 未同步时丢;**acks=all**(推荐)—— 等所有 ISR 同步,配 min.insync.replicas ≥ 2 强持久。典型生产配置:acks=all、replication.factor=3、min.insync.replicas=2。即便一个 Broker 宕机,只要 ISR ≥ 2,数据不丢、服务不中断。

---

## ch04 Producer / Consumer

Kafka 官方提供 Java 客户端,社区维护 confluent-kafka-python(基于 librdkafka C 库)和纯 Python 的 kafka-python。本模块用纯 Python 模拟 Producer/Consumer 行为,便于无 Broker 时做单元测试。

Producer 关键参数:bootstrap.servers(集群入口)、key/value.serializer、acks(推荐 all)、linger.ms(推荐 5~100)、batch.size、compression.type(lz4/zstd)、enable.idempotence(Kafka 0.11+ 幂等,推荐 true)、max.in.flight.requests.per.connection(幂等模式下最多 5)。

Consumer 关键参数:bootstrap.servers、group.id(必填)、key/value.deserializer、auto.offset.reset(earliest/latest)、enable.auto.commit(生产推荐 false)、max.poll.records、session.timeout.ms、max.poll.interval.ms(处理慢的业务要调大)。

Consumer 通过 poll() 循环拉取,一次返回多条 Record。处理顺序:①poll 拉取 → ②业务逻辑 → ③手动 commitSync 提交 Offset。自动提交存在"处理失败但 Offset 已提交"的窗口,会导致丢消息;手动提交可在业务成功后精准提交。

---

## ch05 Offset 与 Consumer Group

Offset 是 Kafka "消费进度"的核心抽象。每个分区对每个 Consumer Group 都维护一个独立 Offset(存于 __consumer_offsets 内部 Topic)。提交 Offset 等于告诉 Broker"这个 Group 已处理到此位置",下次重启或 Rebalance 从提交位置继续。

提交方式:**自动提交**(每 5s,简单但不可控);**手动同步 commitSync**(阻塞至成功);**手动异步 commitAsync**(不阻塞,失败回调);**按分区提交**(精细控制);**存外部系统**(写 MySQL/Redis,实现消费-处理-提交三阶段一致)。

Consumer Group 是 Kafka 实现"广播 + 负载均衡"的关键设计。多个 Consumer 加入同一 Group,Coordinator 把分区尽量均匀分配给这些实例,每个分区只分配给一个 Consumer,实现 Group 内"消息只被消费一次"。不同 Group 各自维护 Offset,实现跨 Group 广播。

Rebalance 触发条件:①Group 成员数变化;②订阅 Topic 分区数变化;③主动 unsubscribe。Rebalance 期间整个 Group 暂停消费,应尽量避免 —— 减小 max.poll.interval.ms 失败、合理设置 session.timeout.ms、及时响应 onPartitionsRevoked 回调清理状态。

分配策略:**RangeAssignor**(默认)、**RoundRobinAssignor**(推荐)、**StickyAssignor**(保持原分配减少抖动,生产推荐)、**CooperativeStickyAssignor**(增量再平衡,KRaft 默认)。

---

## ch06 Exactly-Once 语义

消息投递三种语义:**at-most-once**(至多一次,可能丢)、**at-least-once**(至少一次,可能重)、**exactly-once**(精确一次)。Kafka 通过幂等 Producer + 事务 + 流处理连接三层组合实现端到端 EOS。

**幂等 Producer**(enable.idempotence=true):Broker 为每个 Producer 分配 PID,消息附带 (PID, Partition, SequenceNumber),Broker 端去重,解决 Leader 切换导致重发的单会话重复。

**事务**(transactional.id):跨分区、跨 Topic 的原子写。Producer 启动事务,send 到多分区,commitTransaction 或 abortTransaction 一次性落地。事务消息对 Consumer 不可见,直到事务提交并通过 read_committed 过滤。需要 transactional.state.log.replication.factor ≥ 3。

**幂等 + 事务的限制**:仅保证单 Producer 会话内不重 + 多分区原子写,仍可能因 Consumer 重启从旧 Offset 重放导致业务侧重复。严格 EOS 须配合流处理框架"两阶段提交 + 状态快照":**Kafka Streams EOS**(RocksDB + changelog + 事务提交 offset+state);**Flink Kafka Sink + 两阶段提交**(Checkpoint 触发事务 preCommit,所有算子快照成功后 commitTransaction);**外部系统 EOS**(MySQL/PG 用"幂等写入 + 状态回查"或 XA)。

实时数仓里,Flink 消费 Kafka ods 主题,做维表 join + 聚合 + 写入 Paimon 的 dwd 表;只要 Flink 启用 Checkpoint、KafkaSink 启用事务、transactional.id 唯一,即可保证"一条业务事件只产生一条下游结果"。

---

## ch07 Kafka Connect

Kafka Connect 是 Kafka 官方提供的"数据集成框架",Source Connector 把外部系统(MySQL Binlog、PostgreSQL、文件、S3)导入 Kafka,Sink Connector 把 Kafka 导出到 Elasticsearch、HDFS、JDBC、Paimon 等。以 REST API 管理 Connector 任务,自带分布式 Worker、Offset 存储、Converter 与 SMT(Single Message Transform)。

核心概念:**Connector** —— 配置描述;**Task** —— Connector 的并行执行单元;**Worker** —— 运行 Connector 的 JVM(Standalone 适合开发,Distributed 适合生产);**Offset** —— Connector 自维护进度,存 Kafka __connect_offsets;**Converter** —— 序列化层(JsonConverter/AvroConverter);**SMT** —— 消息级转换(MaskField、InsertField、ExtractTopic、Cast)。

常用 Connector:**Debezium MySQL/PG/MongoDB Source**(基于 Binlog/WAL 的 CDC)、**JDBC Source/Sink**(关系库导入导出)、**Elasticsearch Sink**(实时数仓 ADS 层)、**HDFS/S3 Sink**(离线分析)、**Paimon Sink**(流式入湖)。

实时数仓典型架构:Debezium MySQL → Kafka ods → Flink SQL ETL → Kafka dwd → Flink 聚合 → Kafka dws / Paimon dws → ADS 应用。Connect 适合"无状态搬运",复杂 ETL 仍交给 Flink SQL。

---

## ch08 Schema Registry

随着 Kafka 成为企业级数据总线,消息的"数据契约"变得越来越重要:Producer 改了字段类型,Consumer 解析失败全链路崩溃;数据团队需要追溯 Topic 字段演进历史。Confluent Schema Registry 提供集中化 Schema 管理,Producer/Consumer 通过 REST 注册和拉取 Schema,序列化时把 Schema ID 写入消息头部,Consumer 端按 ID 反序列化。

主流 Schema 格式:**Avro**(强类型、二进制紧凑,Registry 原生支持,推荐);**Protobuf**(字段 tag 演进友好,Kafka 3.x 起官方支持);**JSON Schema**(可读性最好但体积大、演进规则弱)。

Registry 通过兼容性检查约束演进:**BACKWARD**(新 Schema 可被旧 Consumer 读取,常用);**FORWARD**(旧数据可被新 Consumer 读取);**FULL**(两者并集);**NONE**(不检查)。默认 BACKWARD,允许删除字段、添加可选字段、修改默认值,禁止修改已有字段类型。

Schema ID 写入消息头部两种方式:**Wire Format**(Confluent 主流,4B magic byte + 4B schema ID + payload);**HTTP Header**(部分客户端支持,不在消息体内)。

使用要点:**生产端**用 Maven/Gradle 插件从 .avsc/.proto 生成 Java/Python 类,序列化时自动注册/获取;**消费端**反序列化器根据消息头 ID 拉取 Schema,缓存本地;**CI/CD** 把 Schema 文件纳入 Git,提交时跑兼容性测试;**多环境**用 Registry context 隔离(dev/staging/prod)。实时数仓推荐 Avro + Schema Registry + BACKWARD 兼容;Producer 是 Debezium 或 Flink 时同样要把 Schema 推到 Registry,让下游自我描述地解析。

---

## 总结

Kafka 已从"消息中间件"演化为"实时数据基础设施"。配套 `src/kafka_demo.py` 用纯 Python 实现了 Producer、Consumer、Offset、Partition、Consumer Group、Rebalance,无需启动 Kafka 集群即可验证;`tests/test_kafka.py` 包含 4 个测试,覆盖 offset 提交、partition 分配、rebalance、回放重置。
