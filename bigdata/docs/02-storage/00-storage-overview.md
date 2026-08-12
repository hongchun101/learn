# 00. 大数据存储体系总览

> **本章定位**:从体系结构视角俯瞰大数据存储,把"文件系统 / 列式存储 / 消息存储 / 对象存储 / 向量存储"五大类一次性讲清,建立选型坐标系,为后续 HDFS / HBase / Kudu / Iceberg / Hudi / Paimon 章节做铺垫。
>
> **学习目标**:能够在面试中画出"大数据存储分层图",并解释为什么不同场景需要不同存储。

---

## 1. 大数据存储的五大类别

大数据存储并不是"一种 HDFS 走天下"。从读写特征看,主要分为五类:

| 类别 | 代表产品 | 主要特征 | 典型场景 |
| --- | --- | --- | --- |
| 分布式文件系统 | HDFS、Alluxio、JuiceFS | 大文件、顺序写、Append-only、强一致性 | 离线数仓原始层、Spark/Flink 落盘 |
| 列式存储(湖格式) | Iceberg、Hudi、Paimon、Delta Lake | Parquet/ORC 列存 + 元数据 + ACID | 湖仓一体、批流一体查询 |
| 分布式 NoSQL | HBase、Cassandra、ScyllaDB | LSM、K/V 随机读写、强一致 | 用户画像、订单查询、风控特征 |
| 列式分析数据库 | ClickHouse、Doris/StarRocks、Greenplum | MPP、向量化、列存 | 实时 OLAP、Ad-hoc 查询 |
| 消息存储 | Kafka、Pulsar、RocketMQ | 顺序写、Partition、Retention | 日志、CDC、流式管道 |
| 对象存储 | S3、OSS、Ceph、MinIO | 廉价、海量、最终一致 | 数据湖底层、数据备份、冷数据 |
| 向量存储 | Milvus、Weaviate、Qdrant、ES dense_vector | HNSW / IVF、近似最近邻 | RAG、推荐、图像检索 |

> 注:广义"存储"通常把消息存储、对象存储、向量存储也包含进来;它们和 HDFS/湖格式在数据通路里紧密配合,所以本章一并讲解。

---

## 2. 层次架构图

```
+---------------------------------------------------------------+
|  应用层:BI 报表 / 数据科学 / 风控 / RAG 检索                |
+---------------------------------------------------------------+
              |                   |                 |
              v                   v                 v
+-------------------+ +-------------------+ +-------------------+
| OLAP 引擎        | | 流计算引擎        | | 向量检索         |
| Doris/StarRocks  | | Flink/Spark      | | Milvus/ES        |
| ClickHouse/Trino | | Streaming        | |                  |
+-------------------+ +-------------------+ +-------------------+
              |                   |                 |
              v                   v                 v
+---------------------------------------------------------------+
| 湖格式层 (Table Format):Iceberg / Hudi / Paimon / Delta      |
|   - 元数据:Catalog / Snapshot / Manifest / Schema            |
|   - 数据文件:Parquet / ORC / Avro                            |
+---------------------------------------------------------------+
              |                   |                 |
              v                   v                 v
+-------------------+ +-------------------+ +-------------------+
| 列存 OLTP/NoSQL   | | 消息存储          | | 对象存储         |
| HBase / Kudu      | | Kafka / Pulsar    | | S3 / OSS / MinIO |
+-------------------+ +-------------------+ +-------------------+
              |
              v
+---------------------------------------------------------------+
| 分布式文件系统:HDFS / Alluxio (缓存层)                       |
+---------------------------------------------------------------+
              |
              v
+---------------------------------------------------------------+
| 物理层:本地盘(HDD/SSD/NVMe) + 跨节点网络 + 纠删码/多副本 |
+---------------------------------------------------------------+
```

**关键解读**:
- **应用层**通过 SQL/API 发起请求。
- **湖格式层**提供 ACID、Schema 演进、Time Travel 等"数据库特性",底层文件仍是 Parquet,落在对象存储或 HDFS 上。
- **OLAP/NoSQL/消息/对象**四类在数据通路里承担不同角色:消息层负责流式接入,NoSQL/列存 OLTP 负责高并发点查,OLAP 负责复杂分析,对象存储负责低成本归档。
- **HDFS**作为"老牌底座"在云原生时代被对象存储替代;但其设计思想(NameNode/EditLog/副本/纠删码)仍是面试必考点。

---

## 3. 五大类别详解

### 3.1 分布式文件系统(以 HDFS 为代表)

**核心思想**:把一个大文件切成固定大小的 Block(默认 128 MB),分散到多台机器,每块多副本存储。中心化的 NameNode 保存元数据(文件→Block→DataNode 的映射),DataNode 负责真实读写。

**优点**:
- 顺序写吞吐高(Spark/Flink 落盘友好)。
- 与 MapReduce/Spark 生态深度整合。
- 支持纠删码(Erasure Coding)节省 50% 存储。

**缺点**:
- NameNode 单点压力大(虽然有 HA/Federation/RBF 缓解)。
- 不适合大量小文件(每个文件元数据耗内存)。
- 不支持随机写,只支持 Append。

**适用**:离线批处理的原始数据落盘、日志归档、与 Hadoop 生态深度耦合的场景。

### 3.2 列式存储格式(Parquet / ORC)

Parquet 和 ORC 都是"按列存储"的文件格式,**与"列式数据库"不同**:它们只是文件,不是存储系统。

**为什么需要列存?**
- 相同类型的值连续存储,压缩率提升 5–10 倍(行程编码、字典编码、位图)。
- 分析查询只读需要的列,跳过无关列,I/O 减少 80%+。
- 向量化执行友好(每次读 1024 行打包成向量)。

**Parquet vs ORC**:
- Parquet:由 Twitter/Cloudera 发起,生态最广(Spark/Flink/Trino/Iceberg 默认)。
- ORC:Hive 系出身,带轻量级索引(Row Group Index / Bloom Filter),Hive 性能更优。

### 3.3 湖格式(Iceberg/Hudi/Paimon)

湖格式 = 文件格式(Parquet) + 元数据(Catalog/Snapshot/Manifest) + 引擎 API。

**它们解决了 Parquet 没有的能力**:
- ACID 事务(乐观锁 + Snapshot 隔离)。
- Schema 演进(加列、改列名)。
- Hidden Partition(不需要写分区值)。
- Time Travel(查任意历史快照)。
- 行级 MERGE INTO / DELETE(原 Parquet 文件只能整文件覆盖)。

> 详细对比见后续 04/05/06/07 章。

### 3.4 分布式 NoSQL(以 HBase 为代表)

**核心思想**:LSM-Tree(Log-Structured Merge Tree)——写先写 WAL + MemStore(内存),后台异步刷盘成 HFile,读需要合并 MemStore + 多 HFile。

**特征**:
- 单行读写延迟低(毫秒级)。
- 强一致(行级 + Region 内 HLog 副本)。
- 自动分片(Region 按 RowKey 区间分裂)。
- 不擅长全表扫描(虽然有 Phoenix 提供 SQL,但仍非 OLAP)。

**适用**:画像查询、订单详情、风控特征、消息索引。

### 3.5 消息存储(以 Kafka 为代表)

**核心思想**:Partition 顺序写盘 + 偏移量管理 + Retention 策略。

**特征**:
- 顺序写吞吐可达 GB/s 级。
- 消息持久化(默认 7 天)。
- 消费位点可控,可重放。

**适用**:日志采集、CDC、流计算输入、解耦上下游。

> 详细见 `docs/04-resource-messaging/01-kafka-internals.md`。

### 3.6 对象存储(S3 / OSS / MinIO)

**核心思想**:"对象 = 文件 + 元数据 + HTTP API",无限容量,扁平命名空间。

**特征**:
- 99% 的数据湖底层都跑在对象存储上(S3 + Iceberg)。
- 11 个 9 持久性,价格低。
- 一致性模型:强一致(S3 在 2020 年后变为强一致)。
- 不擅长频繁小文件读写(每次都是 HTTP 请求)。

### 3.7 向量存储(以 Milvus 为代表)

**核心思想**:把高维向量(768/1024 维)用 ANN 算法(HNSW/IVF/DiskANN)组织,提供近邻检索。

**特征**:
- 不是替代关系数据库,而是补充。
- 通常与关系库/湖格式共存:结构化属性在关系库,向量在向量库。
- 索引构建代价高,通常离线构建。

---

## 4. 选型矩阵

| 业务诉求 | 首选存储 | 次选 | 不推荐 |
| --- | --- | --- | --- |
| 海量日志冷归档(<10 PB) | 对象存储 + Iceberg | HDFS + Parquet | HBase(贵) |
| 用户画像 / 订单详情(K/V 点查) | HBase | Cassandra | Iceberg(读放大) |
| 实时 OLAP(秒级多表 JOIN) | Doris / StarRocks | ClickHouse | HBase |
| 海量 CDC 同步入湖 | Iceberg + Kafka | Hudi MOR | HDFS 文件 |
| 流批一体(实时+离线) | Paimon + Flink | Iceberg v3 | 传统 Hive |
| LLM/RAG 检索 | Milvus | Elasticsearch | HBase |
| 高频更新 + 全量分析 | Kudu | Iceberg + Flink | HBase |

---

## 5. 生产经验(踩坑 & 调优参数)

### 5.1 常见踩坑

1. **HDFS 小文件**:每个 Namenode 内存最多支撑 1–2 亿文件,小文件过多直接导致 NN OOM。**解决**:合并小文件,SequenceFile/Parquet 打包;启用 Federation 把命名空间分片。
2. **HBase 热点 RowKey**:时间戳/单调递增前缀导致写入全部打到一个 Region。**解决**:RowKey 加盐或哈希散列。
3. **Iceberg Metadata 膨胀**:每次 commit 产生一个 Manifest,高频小写入会生成海量 Manifest。**解决**:合并 Manifest(`rewrite-manifests`)并提高 `commit.manifest.min-count-to-merge`。
4. **对象存储 + HDFS 误用**:把对象存储当 HDFS 用,每次写入发起 HTTP PUT,延迟高。**解决**:用 Alluxio/JuiceFS 做缓存层,或改用 commit-only 模式。
5. **向量库全量重建**:上百万向量重建 HNSW 索引要小时级。**解决**:用增量构建 + 定期全量重平衡。

### 5.2 调优关键参数

| 系统 | 参数 | 推荐值 | 作用 |
| --- | --- | --- | --- |
| HDFS | `dfs.blocksize` | 128 MB / 256 MB | 大文件块大小 |
| HDFS | `dfs.replication` | 3(纠删码可降至 1.5) | 副本数 |
| HBase | `hbase.hregion.max.filesize` | 10–20 GB | Region 大小 |
| HBase | `hbase.regionserver.handler.count` | 30–100 | RPC 线程数 |
| Kafka | `num.partitions` | 与消费者并发相当 | 主题分区数 |
| Iceberg | `write.target-file-size-bytes` | 128 MB / 256 MB | Parquet 输出文件大小 |
| Doris | `tablet_num` | 与 BE 节点数 3× 相当 | 分桶数 |
| ClickHouse | `max_threads` | CPU 物理核数 | 查询并行度 |

---

## 6. 实战任务

### 任务 1:本地起一套最小化"湖仓一体"环境

使用 Docker Compose 启动:
- MinIO(对象存储)
- Hive Metastore + PostgreSQL(元数据)
- Spark 3.5(Iceberg 引擎)
- 一个 Iceberg 表

```yaml
# docker-compose.yaml
services:
  minio:
    image: minio/minio:RELEASE.2024-08-17T01-24-54Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    ports: ["9000:9000", "9001:9001"]
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: metastore
      POSTGRES_USER: hive
      POSTGRES_PASSWORD: hive
  hive-metastore:
    image: apache/hive:3.1.3
    command: /opt/hive/bin/hive --service metastore
    depends_on: [postgres]
```

随后用 Spark SQL 创建表:
```sql
CREATE TABLE iceberg.db.events (
  id BIGINT, user_id STRING, ts TIMESTAMP
) USING iceberg
LOCATION 's3://warehouse/db/events';
INSERT INTO iceberg.db.events VALUES (1, 'u1', now());
SELECT * FROM iceberg.db.events FOR SYSTEM_TIME AS OF '2024-01-01';
```

### 任务 2:对比五种存储的查询延迟

在同一台机器上,分别用 HBase(Phoenix)、ClickHouse、Iceberg(Trino)、MySQL、Milvus,跑 1000 次点查/范围查,记录 P50/P99 延迟。

---

## 7. 专家面试题(5 题)

1. **HDFS、S3、Iceberg 三者是什么关系?数据湖底层为什么通常不用 HDFS?**
2. **列存为什么比行存更适合分析?Parquet 与 ORC 的核心区别?**
3. **Iceberg/Hudi/Paimon 解决的"原 Parquet 文件没有的能力"具体是什么?**
4. **消息存储为什么不能被对象存储替代?Kafka 与 Iceberg 在流式管道里如何分工?**
5. **请画出你公司的存储分层架构,并解释每个组件选型理由。**

---

## 8. 本章小结

- 大数据存储不是"一种走天下",而是五类协同:文件系统 + 湖格式 + NoSQL + OLAP + 消息 + 对象 + 向量。
- 选型矩阵的核心维度:**读写模式、延迟、量级、事务需求、成本**。
- **存储是手段,业务是目的**:50K 工程师要的不是"会用 HDFS",而是"能在 5 分钟内为新业务选出最合适的存储组合"。

下一章:[01-HDFS 原理与源码](./01-hdfs-internals.md)