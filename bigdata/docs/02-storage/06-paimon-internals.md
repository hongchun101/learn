# 06. Paimon(原 Flink Table Store)原理

> **本章定位**:Paimon 是阿里在 2023 年开源(原 Flink Table Store)的湖格式,**专门为 Flink 流批一体设计**。本章从 LSM 分层讲起,深入 Primary Key 表、Changelog Producer、流读流写等 Flink 生态特性。
>
> **学习目标**:能讲清 Paimon 与 Iceberg/Hudi 的本质差异、能在 Flink 作业中正确使用 Paimon Primary Key 表。

---

## 1. Paimon 诞生的背景

阿里在 Flink Forward Asia 2022 宣布"Apache Flink Table Store"开源,2023 年改名 Paimon 进入 Apache。其动机:

- **Flink + Iceberg/Hudi 痛点**:Iceberg/Hudi 都更偏 Spark,Flink 流式集成弱(如 Flink CDC 接入 Hudi 需复杂配置)。
- **流批一体需求**:希望一个存储能同时服务 Flink 流作业与 Spark 批作业。
- **HBase 替代**:把 OLTP 写入与 OLAP 查询合并到一个系统。

**核心目标**:做一个**Flink First 的湖格式**,让 Flink 流式摄入的每一行变更都能被流式订阅。

---

## 2. Paimon vs Iceberg vs Hudi 一句话总结

| 维度 | Iceberg | Hudi | Paimon |
| --- | --- | --- | --- |
| 主语言 | Java | Java/Scala | Java |
| Flink 友好 | 一般 | 一般 | 极佳 |
| Primary Key | 无(MERGE INTO) | 有(可主键) | 有(强主键 + LSM) |
| Changelog | 弱(无 CDC) | 一般 | **强(流读变更)** |
| LSM | 无 | MoR 类似 | **原生 LSM** |
| 流读流写 | 部分 | 部分 | **核心能力** |

---

## 3. Paimon 整体架构

```
+---------------------------------------------------------------+
|  Flink / Spark / Trino / Hive                                 |
+---------------------------------------------------------------+
              |            |            |
              v            v            v
+---------------------------------------------------------------+
|  Paimon Catalog (文件系统/HMS/REST/Aliyun DLF)               |
+---------------------------------------------------------------+
              |
              v
+---------------------------------------------------------------+
|  Schema File (JSON) + Manifest File (JSON)                    |
|  - 类似 Iceberg,但更紧凑                                     |
+---------------------------------------------------------------+
              |
              v
+---------------------------------------------------------------+
|  Snapshot (LSM-Tree 风格的快照)                              |
|  - L0 层:刚写入的文件(未排序)                                |
|  - L1/L2 层:已排序 + Compaction                              |
+---------------------------------------------------------------+
```

---

## 4. LSM 分层

源码入口:`paimon-core/src/main/java/org/apache/paimon/manifest/ManifestFile.java`

Paimon 的核心是 **LSM-Tree**(借鉴 RocksDB / HBase):

### 4.1 数据文件层级

```
L0   (Level 0)  - 最新写入,无排序,可能有重叠
L1   (Level 1)  - 第一次 compaction,按主键排序
L2   (Level 2)  - 后续 compaction,更大文件
...  (更多 Level,可选)
```

**写入**:
1. 新数据写到 L0(可能多个 L0 文件同时存在)。
2. 当 L0 文件数或大小超过阈值,触发 compaction → L1。
3. L1 → L2 触发条件类似,**默认 L1 max size = 256 MB,L2 = 1 GB,L3 = 5 GB**。

**读取**:
1. 优先读 L0(最新)。
2. 逐层读直到 L1/L2(有主键索引,Bloom 快速过滤)。
3. 合并各层结果。

### 4.2 与 HBase LSM 的对比

| 维度 | HBase LSM | Paimon LSM |
| --- | --- | --- |
| 数据格式 | HFile(KV) | Parquet + Orc(列存) |
| 主键 | RowKey | Primary Key |
| 读路径 | BlockCache + Bloom + Block Index | 列存 + Bloom + Zone Map |
| 适用 | 单行点查 | 范围查询 + 流读 |

**本质区别**:HBase 用行存,HBase 的 BlockCache 是 KV;Paimon 用列存,适合分析查询。

### 4.3 LSM 的优势在 Paimon

1. **写入吞吐高**:L0 不排序,直接 append。
2. **读放大可控**:每层文件大,需要读的文件少。
3. **后台 compaction 友好**:用 Spark/Flink 单独跑 compaction,不影响写入。

---

## 5. Primary Key 表

源码入口:`paimon-core/src/main/java/org/apache/paimon/table/system/PrimaryKeyTable.java`

### 5.1 表类型

Paimon 表分两类:

| 类型 | 主键 | 更新语义 | 适用 |
| --- | --- | --- | --- |
| **Append Only Table** | 无 | 仅 append | 日志、CDC raw 层 |
| **Primary Key Table** | 必有 | Upsert / Delete | 宽表、订单、状态 |

### 5.2 Primary Key 表的写入

```sql
CREATE TABLE orders (
  order_id BIGINT PRIMARY KEY NOT ENFORCED,
  user_id BIGINT,
  amount DECIMAL(10, 2),
  status STRING,
  ts TIMESTAMP
);
```

```sql
-- 插入 / 更新
INSERT INTO orders VALUES (1, 100, 99.50, 'paid', current_timestamp);
```

**写入过程**:
1. 计算主键哈希,把记录分配到对应 bucket(`bucket = num_buckets`)。
2. 写 L0 文件(可能多个),同一个 bucket 内按主键部分排序。
3. 触发后台 compaction。

### 5.3 主键冲突:如何确定 update vs insert?

Paimon 用 `sequence.field` 决定:
- 如果新行的 sequence > 旧行 → update。
- 如果新行被删除 → DELETE。

```sql
CREATE TABLE orders (
  order_id BIGINT PRIMARY KEY,
  amount DECIMAL(10, 2),
  ts TIMESTAMP
) WITH (
  'sequence.field' = 'ts'  -- 用 ts 决定最新版本
);
```

---

## 6. Changelog Producer(流式变更订阅)

Paimon 的**杀手锏**:从一张表能"流式"读出所有变更(类似 Kafka 的 changelog topic)。

### 6.1 三种模式

| 模式 | 含义 | 代价 |
| --- | --- | --- |
| **None** | 不产生 changelog | 查询时按需合并 |
| **Input** | 写入时同时输出 changelog | 写代价 ×2 |
| **Lookup Compaction** | Lookup 时合并生成 | 查询慢但写入快 |

```sql
CREATE TABLE orders (
  order_id BIGINT PRIMARY KEY,
  amount DECIMAL(10, 2),
  ts TIMESTAMP
) WITH (
  'changelog-producer' = 'input',       -- 或 'lookup'
  'changelog-producer.row-deduplicate' = 'true'
);
```

### 6.2 流读(Flink 视角)

```java
// Flink 读 Paimon changelog
TableResult result = tEnv.executeSql(
  "SELECT * FROM orders /*+ OPTIONS('scan.changelog.mode' = 'all') */"
);
```

读到的每条记录带 `row_kind`:
- `+I`(Insert)
- `-U`(Update Before)
- `+U`(Update After)
- `-D`(Delete)

可直接对接 Flink 状态机或下游 sink。

### 6.3 实战场景

```
MySQL CDC --> Flink --> Paimon Primary Key 表
                              ↓ changelog
                          Kafka Topic
                              ↓
                          Flink 下游(指标计算、告警)
```

---

## 7. 关键特性:Time Travel + Consumer

### 7.1 Time Travel

```sql
-- 查快照
SELECT * FROM orders VERSION AS OF 1024;
SELECT * FROM orders TIMESTAMP AS OF '2024-01-01 00:00:00';
```

### 7.2 Consumer(消费者进度)

Paimon 表记录每个消费者的读取位置,支持**精确一次消费**:

```sql
CREATE TABLE orders (
  ...
) WITH (
  'consumer.id' = 'flink-job-1',
  'consumer.expiration-time' = '7 d'
);
```

```sql
-- Flink SQL:重启时自动从上次位置读
SELECT * FROM orders /*+ OPTIONS('consumer.id' = 'flink-job-1') */;
```

---

## 8. Bucket 分桶

Paimon 用 **Bucket** 作为数据物理分片单位(类似 HBase Region / Kudu Tablet):

| 模式 | 含义 |
| --- | --- |
| **Fixed Bucket** | 静态分桶(类似 HBase Region) |
| **Dynamic Bucket** | 动态分桶(根据主键基数自动调整) |

```sql
CREATE TABLE orders (...) WITH (
  'bucket' = '4',                  -- 静态 4 桶
  'bucket-key' = 'order_id'
);
```

**Dynamic Bucket 优势**:无需预估数据量,主键新增自动开新桶。

---

## 9. 关键生产调优参数

```sql
CREATE TABLE orders (
  order_id BIGINT PRIMARY KEY,
  amount DECIMAL(10, 2),
  ts TIMESTAMP
) WITH (
  'bucket' = '8',
  'bucket-key' = 'order_id',
  'sequence.field' = 'ts',
  'changelog-producer' = 'input',
  'write-buffer-size' = '64 mb',           -- 写入内存缓冲
  'page-size' = '64 kb',                   -- 列存 page
  'compaction.max.file-num' = '5',         -- 触发 compaction 的文件数
  'compaction.min.file-num' = '3',
  'compaction.target-file-size' = '256 mb',
  'commit.user' = 'flink-job-1'
);
```

---

## 10. 生产经验(踩坑 & 调优)

### 10.1 踩坑清单

| 踩坑 | 现象 | 解决 |
| --- | --- | --- |
| Changelog 输出少 | 下游丢数据 | 启用 `changelog-producer=input` |
| Bucket 数据倾斜 | 某些 bucket 写慢 | 用 dynamic bucket 或换 bucket-key |
| Compaction 不及时 | L0 文件堆积 | 提高 `compaction.max.file-num` 阈值 |
| 主键冲突 | update 不生效 | 检查 `sequence.field` 是否设置 |
| Time Travel 失败 | Snapshot 不存在 | 检查 `snapshot.time-retained` 配置 |

### 10.2 监控指标

| 指标 | 含义 |
| --- | --- |
| `compaction.delay` | compaction 落后多少时间 |
| `l0_file_count` | L0 文件数(警戒 > 50) |
| `changelog.lag` | changelog 输出延迟 |
| `snapshot.num.records` | snapshot 内记录数 |

---

## 11. 实战任务

### 任务 1:Flink + Paimon CDC

```sql
-- 启动 Paimon Catalog
CREATE CATALOG paimon WITH (
  'type' = 'paimon',
  'warehouse' = 's3://bucket/warehouse'
);
USE CATALOG paimon;

-- 创建 Primary Key 表
CREATE TABLE orders (
  order_id BIGINT PRIMARY KEY NOT ENFORCED,
  user_id BIGINT,
  amount DECIMAL(10, 2),
  ts TIMESTAMP
) WITH (
  'bucket' = '4',
  'changelog-producer' = 'input'
);

-- 从 Kafka 写入
INSERT INTO orders
SELECT order_id, user_id, amount, ts FROM kafka_source;
```

### 任务 2:流读变更

```sql
-- 读 changelog,带 row_kind
SELECT order_id, user_id, amount, ts, row_kind
FROM orders /*+ OPTIONS('scan.changelog.mode' = 'all') */;
```

### 任务 3:Dynamic Bucket

```sql
CREATE TABLE user_state (
  user_id BIGINT PRIMARY KEY,
  name STRING,
  last_active TIMESTAMP
) WITH (
  'bucket' = '-1'  -- -1 表示 dynamic bucket
);
```

---

## 12. 专家面试题(5 题)

1. **Paimon 与 Iceberg 在"行级 update"上的实现差异是什么?为什么 Paimon 用 LSM 而 Iceberg 用 Snapshot?**
2. **Paimon 的 Changelog Producer 三种模式( None / Input / Lookup )各自适合什么场景?**
3. **Paimon 的 Fixed Bucket 与 Dynamic Bucket 区别?什么场景用 Dynamic?**
4. **Paimon 的流读流写在 Flink 生态里相比 Hudi 的优势在哪里?**
5. **Paimon LSM 层级 (L0/L1/L2) 与 HBase 的 MemStore/DiskStore 对比有什么异同?**

---

## 13. 本章小结

- Paimon = **Flink First 的湖格式 + LSM + 原生 Changelog**。
- 相比 Iceberg/Hudi,Paimon 在 **流式场景**有明显优势(更低的写入延迟 + 原生 CDC 流读)。
- 但 Paimon 在 **Spark 批处理生态成熟度**上不及 Iceberg。
- 下一章:**三湖(Iceberg / Hudi / Paimon)对比与选型决策**。

下一章:[07-三湖对比与选型决策树](./07-lake-format-choose.md)