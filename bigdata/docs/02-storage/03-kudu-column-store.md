# 03. Kudu 与列存储对比

> **本章定位**:Kudu 是 Cloudera 在 HBase/HDFS 体系外独立设计的"列式存储",主打**实时更新 + 分析查询**两不误。本章从架构出发,深度对比 Kudu / HBase / Iceberg 三者的设计取舍,并解释 MVCC 与 Tablet Server 原理。
>
> **学习目标**:能在面试中清楚讲出"Kudu 为什么存在"、能根据业务选 Kudu 还是 HBase 还是 Iceberg。

---

## 1. Kudu 诞生的背景

大数据生态里,长久以来"快"与"灵活"是矛盾的:

- **HBase**:写快(K/V),但 SQL 弱,分析依赖 Phoenix,扫描慢。
- **Parquet on HDFS**:分析快(列存 + 压缩),但写入是"覆盖文件",不支持实时更新。
- **传统 OLAP(如 Greenplum)**:既能更新又能分析,但扩展性差(几十节点)。

**Kudu 的目标**:把 HBase 的"实时更新"和 Parquet 的"分析性能"融合到一个系统里,支撑"实时数仓"的混合负载。

Cloudera 在 2015 年开源 Kudu(Impala 同一作者团队),定位 **"Fast Analytics on Fast Data"**。

---

## 2. Kudu vs HBase vs Iceberg 三维对比

| 维度 | HBase | Kudu | Iceberg |
| --- | --- | --- | --- |
| 底层结构 | LSM-Tree (HFile) | 列存 + LSM hybrid (MemRowSet/DiskRowSet) | 列存 (Parquet) + 元数据 |
| 主键模型 | RowKey 单一维度 | Primary Key(可多列组合) | 无主键约束 |
| 更新方式 | Put/Delete/VersionColumn | UPSERT/DELETE/UPDATE | MERGE INTO / DELETE |
| 一致性 | 行级强一致 | Snapshot 隔离 MVCC | Snapshot 隔离 |
| 查询引擎 | Phoenix/Spark | Impala/Spark/Trino | Spark/Trino/Flink |
| 典型延迟 | 读 ms,写 ms | 读 ms,写 ms | 读 ms~s,写 s |
| 索引 | Bloom Filter + Block Index | 主键 + Zone Map + Bloom | 元数据 Manifest |
| 数据规模 | 单集群 PB | 单集群 PB | 无限(S3) |
| 写入吞吐 | 高(纯 KV) | 高 | 中(commit 瓶颈) |
| 分析查询 | 弱(列存弱) | 强(列存) | 强(列存) |
| 生态成熟度 | 高(Hadoop 全套) | 中(依赖 Impala) | 高(Spark/Flink/Trino) |

**简明选型口诀**:
- **写多读多 + 分析要求高** → Kudu。
- **写多读多 + 单行点查为主** → HBase。
- **分析为主,写批量为主** → Iceberg。

---

## 3. Kudu 整体架构

```
+-------------------------------------------------------------+
|   Client (Impala/Spark/Java/C++)                            |
+-------------------------------------------------------------+
        |              |               |
        v              v               v
+-----------+   +-----------+   +-----------+
| Tablet Srv|   | Tablet Srv|   | Tablet Srv|  <-- 服务 Tablet
+-----------+   +-----------+   +-----------+
        \              |              /
         -- ConsensusManager (Raft) ---
        |              |               |
        v              v               v
+-----------+   +-----------+   +-----------+
|  Master   |   |  Catalog  |   | Metrics   |
+-----------+   +-----------+   +-----------+
        |
        v
+-------------------------------------------------------------+
|  本地盘 (Data dir) -- 每个 Tablet 一个目录                   |
|  +-- MemRowSet (内存)                                       |
|  +-- DiskRowSet (列存文件,DeltaFile + BaseFile)             |
+-------------------------------------------------------------+
```

**核心组件**:
- **Master**:维护集群元数据(Catalog、Tablet 分配、TabletServer 状态)。一个 Master active,多 standby。
- **Tablet Server**:实际存 Tablet,每个 Tablet 对应一个 Raft leader + 多个 follower。
- **Tablet**:水平分片,默认 8 GB~32 GB。按主键范围分区(也可哈希分区)。
- **Raft**:Tablet 副本之间的一致性协议(主备强一致)。

---

## 4. Tablet Server 详解

源码入口:`src/kudu/tserver/tablet_server.cc`、`src/kudu/tserver/tablet_server_main.cc`

### 4.1 Tablet 内部结构

```
Tablet
  ├── MemRowSet (内存)
  │     ├── 红黑树 (按主键排序的 Row)
  │     └── 支持并发 Insert/Update
  │
  └── DiskRowSet[] (落盘)
        ├── BaseFile (列存,不可变,后台 compaction 生成)
        │     ├── BloomFile
        │     ├── AdhocIndexFile
        │     └── ColumnData files (每列一个文件)
        └── DeltaFile (Redo/Undo 日志,记录最近 update/delete)
              └── DeltaMemStore (内存中,满后 flush)
```

### 4.2 写入路径

```
Client                              TabletServer(Leader)
  |--- UPSERT(row) --> RPC            |
                                   1. 写 Write ahead log (WAL, Raft 强一致)
                                   2. 写到 RowSet (MemRowSet)
                                   3. Raft 复制到 follower,过半确认
                                   4. 提交,返回 Client
```

**写入特点**:
- MemRowSet 中数据是按 RowKey 排序的,无序写入会被排序。
- 单条 UPSERT 会先查 MemRowSet + DiskRowSet 是否已有该主键 → 有则走 update,无则 insert。
- 内存压力大时,把最老 MemRowSet flush 成 DiskRowSet。

### 4.3 读取路径

```
1. 先查 MemRowSet(可能有未 flush 的最新数据)
2. 查所有 DiskRowSet 的 Bloom Filter,过滤掉不含该主键的
3. 对可能含的 DiskRowSet,合并 BaseFile + DeltaFile(按时间戳合并多版本)
4. MVCC 过滤,只返回 <= 读时间戳的版本
5. 返回 Client
```

**优化**:
- **Bloom Filter**:由 AdhocIndex 提供,基于主键前缀。
- **Zone Map**(列统计):min/max 跳过无关 RowSet,分析查询加速。
- **编码**:Run-Length、Dictionary、Bit Packing,与 Parquet 类似。

---

## 5. MVCC(Multi-Version Concurrency Control)

Kudu 用 MVCC 提供 Snapshot 隔离,这是它与 HBase 最大的不同。

### 5.1 为什么需要 MVCC?

HBase 用行级锁,导致读写相互阻塞;**MVCC 让读永远看到一致性快照**,写不阻塞读,读不阻塞写。

### 5.2 Kudu 的 Timestamp

- 每行带 `timestamp`(逻辑时间戳或 HybridTime)。
- Kudu 用 **Hybrid Logical Clock (HLC)**,结合物理时钟 + 逻辑计数器,NTP 偏移容忍。
- 每次写分配新 timestamp,读指定 timestamp 即"读快照"。

### 5.3 MVCC 在 Kudu 中的实现

源码入口:`src/kudu/consensus/opid.cc`、`src/kudu/tablet/mvcc.cc`

- `MvccManager` 维护当前已分配 timestamp 范围。
- 读取时,scan scanner 把所有版本(可能跨 MemRowSet + 多个 DiskRowSet + 多个 DeltaFile)按 timestamp 排序,取最新且 <= 读时间戳的版本。
- 写入时,需要指定 timestamp(自动 = 当前 HLC),不能小于任何已读快照。

### 5.4 一致性保证

| 操作 | 看到的版本 |
| --- | --- |
| 当前读 | 最新已提交版本 |
| Snapshot 读 | 指定 timestamp 的版本 |
| Scan | 同一行所有版本按 timestamp 排序 |

---

## 6. Kudu 的"设计取舍"

### 6.1 与 HBase 的取舍

| 维度 | HBase | Kudu |
| --- | --- | --- |
| **优势** | KV 极致吞吐,生态丰富 | 行列兼顾,SQL 友好 |
| **劣势** | 扫描慢,SQL 弱 | 写入稍慢,生态受限 |
| **设计哲学** | "我是 KV,SQL 加 Phoenix 就行" | "我是列存,SQL 是亲儿子" |

**本质差异**:HBase 用 LSM-Tree 单条记录级别维护,Kudu 用列存 + DeltaFile,合并时按列压缩,所以**分析查询比 HBase 快 10–100 倍**,但**写吞吐只有 HBase 的 30–50%**。

### 6.2 与 Iceberg 的取舍

| 维度 | Iceberg | Kudu |
| --- | --- | --- |
| **优势** | 存算分离,S3 友好,Schema 演进 | 行级 update,延迟低 |
| **劣势** | Update 走 MERGE INTO,Spark/Flink 代价大 | 数据不能跨 HDFS/S3 共享 |
| **设计哲学** | "文件即真相,文件可换" | "Tablet 即真相,Tablet 不可替换" |

**本质差异**:Iceberg 用"快照+清单"实现 ACID,**Update 实际是"读老文件 + 写新文件"**;Kudu 用"主键索引 + Delta 合并"实现行级 update,**Update 是"在原地修改 + 后台合并"**。

### 6.3 Kudu 的局限性

1. **存算耦合**:Tablet 必须绑在 TabletServer 上,不能独立扩容存储。
2. **不支持 S3**:Kudu 强依赖本地盘(WAL + DeltaFile 随机写要求高)。
3. **生态受限**:主要靠 Impala,Spark Kudu 写性能不如 Impala。
4. **二次开发门槛**:C++ 代码,bug 修复依赖社区。

---

## 7. 关键生产调优参数

```yaml
# /etc/kudu/conf/tserver.gflags
--fs_data_dirs=/data1/kudu,/data2/kudu,/data3/kudu   # 多盘分隔
--fs_wal_dir=/data1/kudu_wal                          # WAL 单独盘(重要!)
--memory_limit_hard_bytes=34359738368                 # 32 GB 硬限制
--maintenance_manager_num_threads=8
--tablet_block_size=32768                             # 32 KB block
--compaction_ideal_bytes=268435456                    # 256 MB compaction 目标
```

**调优要点**:
- **WAL 必须放在独立盘**(最好是 NVMe),否则写入抖动。
- **主键设计**:不合理的复合主键会导致 DiskRowSet 顺序写退化为随机写。
- **Compaction**:`compaction_min_imbalance_score` 控制激进程度,过大反而影响读。
- **MemRowSet 大小**:`memrowset_size_mb=256`,过大 flush 慢,过小 compaction 多。

---

## 8. 生产经验(踩坑 & 调优)

### 8.1 踩坑清单

| 踩坑 | 现象 | 解决 |
| --- | --- | --- |
| WAL 慢盘 | 写延迟飙升 | WAL 单独 NVMe 盘 |
| 主键热点 | TabletServer CPU 高 | 哈希分区 + 复合主键 |
| Compaction 慢 | 读延迟升高 | 提高 `compaction_num_threads` |
| Tablet 过多 | Master RPC 慢 | 增大 Tablet 大小到 32 GB+ |
| Impala 元数据刷新慢 | SQL "table not found" | 调 `catalog_service_force_view_reload` |

### 8.2 监控指标

| 指标 | 含义 | 阈值 |
| --- | --- | --- |
| `tablet_count` | 每 TabletServer Tablet 数 | < 100 |
| `op_apply_per_sec` | 每秒应用的操作数 | 单机 < 10k |
| `compaction_running` | 正在跑的 compaction | < 4 |
| `write_latency` | 写入 P99 | < 50 ms |
| `block_cache_hit_rate` | 块缓存命中率 | > 85% |

---

## 9. 实战任务

### 任务 1:本地起 Kudu + Impala

```bash
docker run -d --name kudu \
  -p 7051:7051 -p 8051:8051 -p 25000:25000 \
  apache/kudu:latest
```

创建表并插入:
```sql
-- 在 Impala 中
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  name STRING,
  age INT
)
PARTITION BY HASH(id) INTO 8 BUCKETS
STORED AS KUDU;

INSERT INTO users VALUES (1, 'alice', 30), (2, 'bob', 25);
UPDATE users SET age = 31 WHERE id = 1;
SELECT * FROM users WHERE age > 20;
```

### 任务 2:Kudu vs HBase 写入延迟对比

```java
// Kudu Java API
KuduClient client = new KuduClient.KuduClientBuilder("localhost:7051").build();
KuduTable table = client.openTable("impala::default.users");
Insert insert = table.newInsert();
insert.getRow().addLong("id", 1);
insert.getRow().addString("name", "test");
client.newSession().apply(insert);
```

对比 HBase Put,观察 Kudu 多列写入是否比 HBase 慢。

### 任务 3:制造热点,观察 Tablet 分布

```bash
# 主键递增,所有写打到一个 Tablet
INSERT INTO users SELECT id, name, age FROM other_table WHERE id BETWEEN 1 AND 1000000;
```

观察 Kudu Master UI:https://localhost:8051,看哪个 TabletServer 负载高。

---

## 10. 专家面试题(5 题)

1. **Kudu 的定位是什么?为什么 HBase + Parquet 不能满足"实时分析"?**
2. **Kudu 的 MVCC 如何实现?HBase 为什么不用 MVCC?**
3. **Tablet Server 与 Region Server 的核心区别?Kudu 的 Raft 与 HBase 的 HLog 副本机制区别?**
4. **Kudu 适合什么场景?如果给你一个用户画像需求,你选 HBase 还是 Kudu?为什么?**
5. **Kudu 的 DeltaFile 与 HBase 的 MemStore 在"实现行级更新"上有什么本质区别?**

---

## 11. 本章小结

- **Kudu = 列存 + 行级更新 + Raft 强一致**,"HBase 的写 + Parquet 的读"。
- 它填补了 HBase(强写弱读)与 Iceberg(强读弱写)之间的空白。
- **存算耦合 + 不支持 S3** 是 Kudu 的硬伤,云原生时代逐渐被 Iceberg/Hudi 替代。
- 下一章进入湖格式:**Iceberg 原理与生产实践**。

下一章:[04-Iceberg 原理与生产实践](./04-iceberg-internals.md)