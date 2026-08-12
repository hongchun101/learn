# 04. Iceberg 原理与生产实践

> **本章定位**:Iceberg 是当前湖仓一体的"事实标准"之一。本章从 Catalog → Metadata → Snapshot → Manifest → Parquet 全链路讲清,覆盖 Iceberg v3 新特性(Puffin、行级 DELETE)、Hidden Partition、Time Travel、Rewrite Data Files 等核心能力。
>
> **学习目标**:能讲清楚 Iceberg 元数据层级关系、能在生产中正确使用 Time Travel、Hidden Partition 和 Compaction。

---

## 1. Iceberg 的定位与设计目标

Iceberg 由 Netflix 在 2017 年开源(2018 进入 Apache),解决的核心问题是:**传统 Hive 表只是"分区目录",没有真正的表语义**。

具体问题:
- **Hive 不支持原子性**:写一个分区可能一半成功一半失败。
- **无并发控制**:两个 Spark 同时写会丢数据。
- **无 schema 强制**:写脏数据 Hive 不报错。
- **查询慢**:要全量扫描目录 + 解析文件名。

**Iceberg 的目标**:
1. 真正的表语义(Schema、表、ACID)。
2. 高级元数据(列统计、分区演变)。
3. 引擎无关(Spark/Trino/Flink/Hive 都能读)。
4. 隐藏分区(Hidden Partition,无需手动维护分区值)。

---

## 2. Iceberg 架构与术语

```
+------------------------------------------------------------+
|  Catalog (REST / Hive / Glue / Nessie / JDBC / Snowflake) |
|  存放: database, table, current snapshot id               |
+------------------------------------------------------------+
              |
              v
+------------------------------------------------------------+
|  Metadata (JSON 格式,存在对象存储 / HDFS)                 |
|    - versioned metadata.json                               |
|    - 当前 schema、partition spec、snapshot list           |
|    - snapshot 列表(每个 snapshot = 一个版本)              |
+------------------------------------------------------------+
              |
              v
+------------------------------------------------------------+
|  Manifest List (.avro 格式)                                |
|    - 一个 snapshot 对应一个 manifest list                  |
|    - 每行: manifest_path, partition_summary, sequence_num |
+------------------------------------------------------------+
              |
              v
+------------------------------------------------------------+
|  Manifest File (.avro 格式)                                |
|    - 每个 manifest 包含若干 DataFile                       |
|    - 每行: file_path, partition_tuple, column_stats       |
+------------------------------------------------------------+
              |
              v
+------------------------------------------------------------+
|  Data File (Parquet / ORC / Avro)                          |
|    - 实际数据,不可变                                       |
+------------------------------------------------------------+
```

---

## 3. Catalog(目录)

Catalog 负责"表 → 当前 metadata"的映射。Iceberg 支持多种 Catalog 实现:

| Catalog | 适用 |
| --- | --- |
| **Hive Catalog** | 已有 Hive Metastore 的老集群 |
| **REST Catalog** | Polarberg、Tabular、Nessie,云原生友好 |
| **Glue Catalog** | AWS 生态 |
| **Nessie Catalog** | 跨表事务 + Git 语义 |
| **JDBC Catalog** | 单库,小规模 |
| **Snowflake / BigQuery** | 云数仓内置 |

**核心契约**:Catalog 必须原子性地"更新 current snapshot",可以用乐观锁(版本号)或悲观锁(ZooKeeper)实现。

---

## 4. Metadata(JSON)

源码入口:`core/src/main/java/org/apache/iceberg/TableMetadata.java`

每个 `metadata.json` 都包含:
```json
{
  "format-version": 2,
  "table-uuid": "...",
  "location": "s3://bucket/db/tbl",
  "last-updated-ms": 1700000000000,
  "last-column-id": 5,
  "current-schema-id": 0,
  "schemas": [...],
  "partition-specs": [...],
  "default-spec-id": 0,
  "last-partition-id": 0,
  "snapshots": [
    { "snapshot-id": 1, "timestamp-ms": 1700000000000, "manifest-list": "s3://.../snap-1-manifest.avro", "summary": {...} },
    ...
  ],
  "current-snapshot-id": 5,
  "snapshot-log": [...],
  "metadata-log": [...],
  "refs": { "main": { "snapshot-id": 5, "type": "branch" } }
}
```

**关键点**:
- `current-snapshot-id` 是当前查询的入口。
- `snapshots` 列表是所有历史快照(可 Time Travel)。
- `refs` 是分支 / 标签(Nessie 用得多)。

---

## 5. Snapshot 与 Manifest

### 5.1 Snapshot

每次 commit 产生一个新 Snapshot:
- `snapshot-id` 自增。
- `manifest-list` 指向该 Snapshot 包含的所有 Manifest 文件。
- `summary` 记录本次操作(`append`/`delete`/`overwrite`/`replace`等)。

### 5.2 Manifest List(.avro)

一个 Snapshot 对应一个 Manifest List,内部列出所有 Manifest File:
```
| path | length | partition-spec-id | content (data/deletes) | sequence-number | min-sequence-number | snapshot-id | partitions (列统计) |
```

### 5.3 Manifest File(.avro)

一个 Manifest File 包含若干 DataFile 元数据:
```
| status (0=existing, 1=added, 2=deleted) | snapshot_id | sequence_number | file_path | file_format | partition_tuple | record_count | file_size_in_bytes | value_counts | null_value_counts | lower_bounds | upper_bounds |
```

**关键洞察**:
- Manifest File 是查询规划的入口,**Trino/Spark 读 Manifest 就能知道哪些文件包含目标分区 / 列范围,跳过无关文件**。
- 元数据是 Avro,查询解析也很快(比 Hive 解析文件路径快几个数量级)。

---

## 6. Parquet 数据文件

Parquet 是 Iceberg 的默认数据格式(也可 ORC/Avro)。
- 列存、压缩(Snappy/Zstd)、Bloom/RG 索引。
- Iceberg v2 起对 Parquet 写入增加排序统计、列级 Bloom。
- Iceberg **不强绑定 Parquet**:可以自定义实现 IFileFormat。

---

## 7. Iceberg v2 vs v3 关键差异

### 7.1 v2 特性(2022)

- **Row-level DELETE**:通过 `delete files`(`position deletes` + `equality deletes`)实现行级删除,不再需要重写整个 Parquet 文件。
- **Schema Evolution by ID**:列用 ID 标识(不用名字),改列名不影响数据。
- **Partition Evolution**:分区策略可改,旧数据自动重映射。

### 7.2 v3 特性(2024)

| 特性 | 含义 |
| --- | --- |
| **Puffin 文件** | 新的统计文件格式,存 NDV(Num Distinct Values)、TopK、Theta Sketch 等高级统计,加速查询 |
| **Encryption** | 文件级加密(Key Management 集成) |
| **Default Columns** | 列默认值,写入时可省略 |
| **Sort Order** | 表级 Sort,默认按某几列排序写入(强 Z-Order) |
| **Materialized Views** | 物化视图(尚在完善) |
| **Variant / Geometry 类型** | 半结构化数据支持 |

---

## 8. Hidden Partition(隐藏分区)

### 8.1 传统 Hive 分区的痛点

```sql
-- Hive 分区
PARTITIONED BY (dt string)
INSERT INTO TABLE t PARTITION(dt='2024-01-01') SELECT ...;
```

查询时必须写 `WHERE dt='2024-01-01'`,漏写会全表扫描。

### 8.2 Iceberg 的隐藏分区

```sql
-- Iceberg
CREATE TABLE t (
  id BIGINT, ts TIMESTAMP, name STRING
) PARTITIONED BY (days(ts));

-- 写入时不必指定分区值
INSERT INTO t VALUES (1, now(), 'alice');

-- 查询时也不必指定分区值,自动按 days(ts) 剪枝
SELECT * FROM t WHERE ts >= '2024-01-01';  -- 自动剪枝到对应分区
```

**原理**:Iceberg 在写入时根据 `partition spec`(如 `days(ts)`)自动生成 partition tuple,在 Manifest 中存好;查询时用 `ts` 表达式推导覆盖哪些 partition,**查询语义与分区解耦**。

---

## 9. Time Travel

Iceberg 的 Snapshot 机制天然支持 Time Travel:

```sql
-- 查历史快照
SELECT * FROM t FOR SYSTEM_TIME AS OF '2024-01-01 00:00:00';
SELECT * FROM t FOR SYSTEM_VERSION AS OF 1234567890;

-- 用 tag 查
ALTER TABLE t CREATE TAG `daily-2024-01-01` AS OF VERSION 12345;
SELECT * FROM t TAG 'daily-2024-01-01';
```

**生产用途**:
- 数据审计(查过去任意时间的状态)。
- 误删恢复(回滚到某个 Snapshot)。
- A/B 测试(同一表不同分支)。

---

## 10. Row-Level DELETE(MERGE INTO / DELETE)

### 10.1 旧 Hive 模式

```sql
-- Hive:全表重写或分区重写,极慢
INSERT OVERWRITE TABLE t PARTITION (dt='2024-01-01') SELECT * FROM t WHERE id NOT IN (...);
```

### 10.2 Iceberg v2+

```sql
-- Iceberg:行级 DELETE
DELETE FROM t WHERE id = 123;

-- MERGE INTO(CDC 场景)
MERGE INTO t USING updates s ON t.id = s.id
WHEN MATCHED THEN UPDATE SET t.name = s.name
WHEN NOT MATCHED THEN INSERT VALUES (s.id, s.name);
```

**底层**:
- **Position Deletes**:记录 `(file_path, position)`,扫描时跳过。
- **Equality Deletes**:记录 `value`,扫描时按主键过滤。
- v3 进一步优化为 **Deletion Vectors**(RoaringBitmap),文件内按 row-id 标记删除,**读时跳过,几乎零成本**。

---

## 11. Rewrite Data Files(Compaction)

### 11.1 为什么需要?

小文件问题:每次 commit 都产生新文件,长期积累会导致:
- 单次查询读文件数爆炸(HDFS 上万次 RPC)。
- Plan 阶段 Manifest 解析慢。

### 11.2 触发方式

```sql
-- 触发数据文件合并
CALL spark_catalog.system.rewrite_data_files('db.tbl');

-- 按分区合并
CALL spark_catalog.system.rewrite_data_files(
  table => 'db.tbl',
  strategy => 'sort',
  sort_order => 'zorder(id, ts)',
  options => map('target-file-size-bytes', '536870912')
);
```

### 11.3 Rewrite Manifests

```sql
-- 合并 Manifest 文件,降低 Plan 阶段开销
CALL spark_catalog.system.rewrite_manifests(
  table => 'db.tbl',
  options => map('min-input-files', '10')
);
```

### 11.4 策略

| 策略 | 含义 | 适用 |
| --- | --- | --- |
| `binpack` | 把小文件合成大文件,不重排 | 默认 |
| `sort` | 按某列排序重写 | 范围查询场景 |
| `zorder` | Z-Order 多维排序 | 多列查询场景 |

---

## 12. 关键生产调优参数

```sql
-- Iceberg 表属性
ALTER TABLE db.tbl SET TBLPROPERTIES (
  'write.target-file-size-bytes' = '536870912',     -- 512 MB
  'write.parquet.compression-codec' = 'zstd',
  'commit.manifest.target-size-bytes' = '8388608',  -- 8 MB
  'commit.manifest.min-count-to-merge' = '5',       -- 5 个 Manifest 触发合并
  'commit.manifest-merge.enabled' = 'true',
  'read.split.target-size' = '134217728',           -- 128 MB scan 拆分
  'read.split.openfile-cost' = '4194304',
  'write.distribution-mode' = 'hash',               -- 避免数据倾斜
  'write.update.mode' = 'merge-on-read',
  'write.delete.mode' = 'merge-on-read'
);
```

**Spark 写入参数**:
```sql
SET spark.sql.iceberg.optimize.write.file-size-bytes = 536870912;
SET spark.sql.iceberg.commit.manifest.min-count-to-merge = 5;
```

---

## 13. 生产经验(踩坑 & 调优)

### 13.1 踩坑清单

| 踩坑 | 现象 | 解决 |
| --- | --- | --- |
| Metadata 膨胀 | 查询 Plan 慢 | 定期 `rewrite_manifests` |
| Row-level DELETE 慢 | MERGE INTO 卡住 | 启用 Deletion Vectors |
| Hidden Partition 写错 | 数据没分区剪枝 | 检查 `partition_spec` 是否覆盖查询谓词 |
| Time Travel 失败 | Snapshot 已被 GC | 配置 `history.expire.min-snapshots-to-keep` |
| 并发写冲突 | `CommitFailedException` | 重试逻辑 + 适当减小 partition |

### 13.2 监控指标

| 指标 | 含义 | 阈值 |
| --- | --- | --- |
| Snapshot 数 | 表历史 Snapshot 数 | < 100(超则 expire) |
| Manifest 平均大小 | Manifest List 大小 | > 1 MB(过小则合并) |
| DataFile 平均大小 | Parquet 文件大小 | 100–500 MB |
| Manifest List 总大小 | 元数据体积 | < 100 MB |

---

## 14. 实战任务

### 任务 1:Spark + Iceberg 读写

```python
from pyspark.sql import SparkSession
spark = SparkSession.builder \
    .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.iceberg.spark.SparkSessionCatalog") \
    .config("spark.sql.catalog.spark_catalog.type", "hive") \
    .getOrCreate()

spark.sql("""
CREATE TABLE spark_catalog.db.t (
  id BIGINT, name STRING, ts TIMESTAMP
) USING iceberg PARTITIONED BY (days(ts))
""")
spark.sql("INSERT INTO spark_catalog.db.t VALUES (1, 'alice', current_timestamp())")

# Time Travel
spark.sql("SELECT * FROM spark_catalog.db.t FOR SYSTEM_TIME AS OF '2024-01-01'")
```

### 任务 2:MERGE INTO(模拟 CDC)

```sql
MERGE INTO spark_catalog.db.t t
USING (SELECT * FROM updates) s
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;
```

### 任务 3:观察元数据层级

```bash
# 在 S3 / HDFS 上看
ls /warehouse/db/t/metadata/
# metadata.json (v1, v2, ...)
ls /warehouse/db/t/metadata/snap-*.avro  # manifest list
ls /warehouse/db/t/metadata/*-manifest.avro  # manifest files
ls /warehouse/db/t/data/*.parquet  # data files
```

---

## 15. 专家面试题(5 题)

1. **Iceberg 的三层元数据(metadata / manifest list / manifest file)各自的作用是什么?为什么不能合并?**
2. **Hidden Partition 的原理?Iceberg 写入时和查询时分别做了什么?**
3. **Time Travel 是如何实现的?为什么要定期 expire snapshot?**
4. **Iceberg v2 的 Row-Level DELETE 如何避免重写整个 Parquet 文件?Deletion Vectors 是什么?**
5. **Iceberg 的 `merge-on-read` 与 `copy-on-write` 各自适合什么场景?**

---

## 16. 本章小结

- Iceberg 是当前**湖仓一体的"事实标准"**,核心是 Snapshot + Manifest + Parquet。
- v2 引入 Row-Level DELETE,v3 引入 Puffin + Deletion Vectors,弥补了 Parquet 没有的"行级 update"短板。
- 生产重点:**Metadata 控制、Hidden Partition 利用、Time Travel 治理、定期 Compaction**。
- 下一章:**Hudi 原理与生产实践**(另一种湖格式)。

下一章:[05-Hudi 原理与生产实践](./05-hudi-internals.md)