# Module 04 · Hadoop 分布式存储与计算基础

> 本模块面向数据仓库工程师，从生产视角理解 HDFS、YARN 与 MapReduce 的设计取舍。
> 模块配套 `src/hdfs_demo.sql` 用 DuckDB 模拟 HDFS 集群的目录、副本、机架、YARN 队列与
> MapReduce 流水线，便于在笔记本上无集群完成全部实验。

## ch01 · HDFS 架构总览

HDFS（Hadoop Distributed File System）是 Hadoop 体系的底座，定位是 **「一次写、多次读」**
的 PB 级顺序文件系统。它由两类进程组成：

* **NameNode（NN）**：单点进程，内存里维护整棵文件系统树（INode）、文件到块的映射
  （`/data/orders.parquet → [blk_orders_0, blk_orders_1]`）、以及每个块的副本位置。
  NameNode 不存数据，只存元数据；元数据先写 EditLog（WAL），再合并到 FsImage。
* **DataNode（DN）**：每个机器一个，负责存真实 block（默认 128 MB），并周期性地向
  NameNode 心跳汇报块列表。

读写流程：

1. **读**：客户端先问 NameNode 要文件的所有 block 位置，得到一个「最近 DN 列表」，
   然后直接连最近的 DataNode 流式拉取，多个 block 并行拉。
2. **写**：客户端把数据切成 packet，沿 pipeline（DN1 → DN2 → DN3）逐级推送，
   每跳确认后才返回 ack，最后再告诉 NameNode 提交元数据。

HDFS 的设计取舍：**「移动计算比移动数据便宜」**，所以大文件顺序写场景（数仓 ODS、
日志归档）极合适；但随机写、低延迟读是它的弱项，后面 ch08 会专门讨论何时不选它。

## ch02 · HDFS 命令行与「块」的物理布局

`hdfs dfs` 是日常运维入口，常用子命令：

| 命令 | 作用 |
| --- | --- |
| `hdfs dfs -ls /data` | 列目录，等价于 `v_hdfs_ls` 视图 |
| `hdfs dfs -put local.parquet /data/` | 上传，会触发 pipeline 写 + 副本放置 |
| `hdfs dfs -du -h /data/orders.parquet` | 看文件实际占用（= 文件大小 × 副本数） |
| `hdfs dfs -getfacl /data/...` | 看 ACL，配合 Ranger/Kerberos 做权限审计 |
| `hdfs dfs -chown etl:hadoop /data/...` | 改属主 |

`hdfs dfs -ls` 的输出里 `replication` 列就是这个文件块的副本数；本模块的
`src/hdfs_demo.sql` 把它具象化成 `v_hdfs_ls` 视图：每个文件一行，列名直接对应
`replication`、`total_bytes`、`racks`，方便用 SQL 做容量治理。

**实战经验**：`dfs.blocksize` 默认 128 MB（`hdfs-site.xml`），写 GB 级小文件会被切成
几十个块，元数据爆炸；数仓层一般会攒到接近 block size 再写，Hive/Impala 的
`parquet.block.size` 参数也是同一思想。

## ch03 · NameNode 与 DataNode 的副本策略

HDFS 默认 `dfs.replication = 3`，意思是每个 block 写三份。副本放置由 NameNode 的
**ReplicaPlacementPolicy** 决定，默认规则（默认 3 副本）：

1. 第一副本：放在**写客户端所在节点**（若是集群外客户端，则随机挑一个不太忙的 DN）。
2. 第二副本：放到**不同机架**的一个节点。
3. 第三副本：放到**与第二副本同一机架**的不同节点。

这条策略的精髓在于 **「任意一个机架断电都不丢数据」**，同时减少跨机架流量。
当某个 DataNode 心跳超时（默认 10 分钟），NameNode 会把它的 block 标记为「待复制」，
异步触发新副本，直到恢复 `dfs.replication`。

`src/hdfs_demo.sql` 用 `replicas` 表 + `datanodes.rack_path` 把这条规则做成可断言的
数据：每条 block 的 3 个副本必须落在 **≥ 2 个不同 rack**，且 **3 个不同 DN**。
`tests/test_ch04_rack_awareness` 直接对这条性质做断言，回归测试不通过就说明
副本表被人手抖改坏了。

## ch04 · 机架感知（Rack Awareness）

**机架感知**是 NameNode 选择副本节点时使用的拓扑信息。集群启动时 DN 会读
`net.topology.script.file.name` 指向的脚本，返回自己的 `/rack1/rack2/...` 路径，
NN 据此建立 `rack_path → [DN]` 的映射。

作用：

* **数据可用性**：副本跨机架 → 单机架电源/交换机故障不丢数据。
* **网络局部性**：读优先选同机架 DN；写 pipeline 也优先同机架。
* **成本权衡**：跨机架副本占交换机带宽，所以默认策略把「第三副本」放回第二副本的
  机架，控制跨机架流量在 1/3。

如果忘了配 `net.topology.script.file.name`，所有 DN 都默认 `/default-rack`，
副本数 = 3 但都在同一「逻辑机架」上，等于没有容灾——这是生产事故的常见根因。

本模块用 `v_rack_distance(rack_a, rack_b, distance)` 视图建模两个机架之间的距离
（0 = 同机架，1 = 不同机架），`test_ch04_rack_awareness` 校验每个 block 的副本
至少跨 2 个机架，即 `distance > 0` 的副本数 ≥ 1。

## ch05 · YARN 资源调度

YARN（Yet Another Resource Negotiator）是 Hadoop 2.0 引入的资源管理层，把集群的
CPU/内存从 MapReduce 手里抽出来，让 Spark、Flink、Tez、Presto 都能跑在同一个集群
上。三类进程：

* **ResourceManager (RM)**：全局唯一，负责把集群 `<memory MB, vcore>` 切成
  **Container** 派发出去。
* **NodeManager (NM)**：每台机器一个，负责启停 Container 并监控资源。
* **ApplicationMaster (AM)**：每个应用一个（Spark Driver / MR AppMaster），向 RM
  申请 Container，再通知 NM 启动 Task。

队列（Scheduler）有两种主流实现：

* **Capacity Scheduler**（YARN 默认）：每个队列一个容量保证（`capacity`）和上限
  （`maximum-capacity`），父队列可以嵌套子队列，适合多租户。
* **Fair Scheduler**：按需抢占，交互式查询友好。

`src/hdfs_demo.sql` 的 `yarn_queues` + `yarn_apps` + `yarn_queue_usage` 视图就模拟了
Capacity Scheduler 的账本：每个 queue 当前的 `used_mb` / `free_mb`。生产里看队列
打满了，先 `yarn rmadmin -refreshQueues` 还是先扩容，看的就是这张表。

## ch06 · MapReduce 原理

MapReduce 是 Hadoop 最早的计算模型，把任意计算拆成 4 步：

```
input → map (k1,v1) → list(k2,v2) → shuffle/group by k2 → reduce(k2, list(v2)) → output
```

* **Map 阶段**：每个 block 一个 mapper，按行处理，输出 `(key, value)` 键值对。
  mapper 数 = block 数（可通过 `mapreduce.input.fileinputformat.split.minsize` 调）。
* **Shuffle 阶段**：Hadoop 把 mapper 输出按 key 哈希分区，写到本地磁盘，再由 reducer
  远程拉取——**shuffle 是性能瓶颈**，99% 的调优都在调这里。
* **Reduce 阶段**：拿到 `list(value)` 后做聚合（sum、count、join、排序）。

经典案例是 **WordCount**：mapper 把每行文本切成 `(word, 1)`，reducer 按 word sum。
`src/hdfs_demo.sql` 把它翻译成 SQL：

* `word_count_split` 视图 = mapper 阶段，输出 `(word, 1)`。
* `word_count` 视图 = reducer 阶段，`SUM(cnt) GROUP BY word`。
* `order_status_split` / `order_status_reduced` 同理做了状态 + GMV 的 MR pipeline。

之所以在数仓里仍然提 MapReduce，是因为 Hive on MR、Tez on YARN、Spark 的
`--deploy-mode cluster` 底层都走同一套 shuffle 协议。看懂 MR，等于看懂了 shuffle。

## ch07 · Hadoop 生态一览

Hadoop 不是一个软件，而是一族围绕 HDFS + YARN 演化出来的工具集。本模块的
`ecosystem` 表按层分类：

| 层 | 工具 | 替代关系 |
| --- | --- | --- |
| 存储 | HDFS, HBase, Ozone | HDFS 仍是默认底座 |
| 资源 | YARN, Mesos, K8s | 离 Hadoop 越来越远 |
| 计算 | MapReduce, Tez, Spark, Flink | 新项目默认 Spark/Flink |
| SQL | Hive, Impala, Presto/Trino | Hive 离线、Trino 交互 |
| 调度 | Oozie, Airflow, DolphinScheduler | Airflow 已是事实标准 |
| ETL | Sqoop, Flume, DataX | Flume 已退役，DataX 流行 |
| 表格式 | Iceberg, Hudi, Delta | 在 HDFS 之上加 ACID 与 schema evolution |

教学/老仓仍是 Hive + Tez 的天下，新建的湖仓一体几乎都是 Spark + Iceberg + Airflow。
数仓学习路径建议：**HDFS 概念 → YARN → MapReduce 思想 → Hive SQL → Spark SQL →
Iceberg → Airflow**——本仓库的模块 05、06、08、13 正是这个顺序。

## ch08 · 何时用 Hadoop

Hadoop 不是银弹。本模块 `workload_fit` 表给了一张决策清单：

**适合 Hadoop 的场景**：

* **多 TB 级批处理 ETL**（每晚一次），Hive/Spark SQL 跑 30 分钟到几小时。
* **冷数据归档**（> 1 年，PB 级），HDFS 三副本 + EC 编码，成本最低。
* **数据湖底座**，配合 Iceberg/Hudi 做 schema evolution 与 ACID。

**不适合 Hadoop 的场景**：

* **低延迟交互式 BI**（< 5 秒响应）：用 ClickHouse / StarRocks / Snowflake。
* **秒级流式告警**：用 Kafka + Flink，别硬上 Spark Streaming 微批。
* **随机点查**（按主键查一行）：用 HBase / Cassandra / DynamoDB，HDFS 不擅长。
* **小数据集 + 高频迭代 ML**：单机 pandas/Polars + GPU 比集群 MR 快。

判断口诀：**「数据量 × 处理频率」越大，越倾向 Hadoop；越要求低延迟或强一致，
越倾向专用引擎**。2024 年后的趋势是「数据湖用 HDFS/S3 + Iceberg，计算用
Spark/Flink，调度用 Airflow，BI 用云数仓」——Hadoop 从「全家桶」收缩成「底座」。