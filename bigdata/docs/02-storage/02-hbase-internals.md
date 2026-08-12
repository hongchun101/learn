# 02. HBase 架构与读写链路

> **本章定位**:HBase 是大数据存储体系的"列式 KV 数据库"代表。本章从 RegionServer 启动开始,深入 MemStore/HFile/WAL/Compaction 四大组件,讲解读写链路、Region 副本一致性、RowKey 设计等面试必考点。
>
> **学习目标**:能在面试中画清楚 HBase 写入链路,能解释"为什么 WAL 比 MemStore 先写"、能定位生产中"热点 / 写入慢 / Compaction 卡"等典型问题。

---

## 1. HBase 整体架构

```
+------------------------------------------------------------+
|  Client (HBaseClient / Phoenix / Spark on HBase)          |
+------------------------------------------------------------+
            |            |             |
            v            v             v
+-----------+   +-----------+   +-----------+
| RegionSrv |   | RegionSrv |   | RegionSrv |   <- ZK 注册
|   A       |   |   B       |   |   C       |
| [R1,R2]   |   | [R3,R4]   |   | [R5,R6]   |   Region 物理节点
+-----------+   +-----------+   +-----------+
        |             |             |
        v             v             v
+------------------------------------------------------------+
|  HDFS  (WAL + HFile 实际落盘)                              |
+------------------------------------------------------------+
              |
              v
+------------------------------------------------------------+
|  ZooKeeper + HBase Master                                  |
|  (Meta 表位置 / Region 分配 / Failover)                    |
+------------------------------------------------------------+
```

**核心角色**:
- **HMaster**:负责 Region 分配、负载均衡、DDL。Master 故障不影响读写(只影响建表/分裂)。
- **RegionServer**:实际存数据的节点,管理若干 Region。
- **Region**:表按 RowKey 区间水平拆分,每个 Region 物理上对应 HDFS 上一个目录。
- **Store**:Region 内按列族划分,每个 CF 一个 Store。
- **MemStore**:写缓存,默认 128 MB 后 flush 到 HFile。
- **WAL**:Write-Ahead Log,所有写先写 WAL 再写 MemStore,防进程崩溃丢数据。
- **HFile**:最终落盘的列存文件,基于 Parquet 思想但格式不同。

---

## 2. RegionServer 详解

源码入口:`hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegionServer.java`

### 2.1 启动流程

```
1. 启动 RPC Server + WebUI
2. 连接 ZooKeeper,在 /hbase/rs 下创建临时节点
3. 从 Master 拉取 Meta 表位置
4. 打开本地 Region(读 Region 目录的 .regioninfo)
5. 创建 WAL、HDFS 客户端
6. 启动 MemStore flush 线程、Compaction 线程、Replication 线程
7. 开始接受 RPC
```

### 2.2 关键线程

| 线程 | 作用 |
| --- | --- |
| `RpcServer.handler` | 处理 RPC 请求(读/写/Mutation) |
| `MemStoreFlusher` | 定期 flush MemStore 到 HFile |
| `CompactSplitThread` | Compaction 与 Region Split 调度 |
| `LogRoller` | 周期滚动 WAL(避免单文件过大) |
| `ReplicationSourceThread` | 主备复制源 |

### 2.3 关键配置

```xml
<property>
  <name>hbase.regionserver.handler.count</name>
  <value>64</value>     <!-- RPC handler 数,默认 30 -->
</property>
<property>
  <name>hbase.hregion.max.filesize</name>
  <value>21474836480</value>  <!-- 20 GB,Region 超过则分裂 -->
</property>
<property>
  <name>hbase.regionserver.region.split.enabled</name>
  <value>true</value>
</property>
<property>
  <name>hbase.regionserver.wal.enable</name>
  <value>true</value>  <!-- 关闭 WAL 可提速但有丢数风险 -->
</property>
```

---

## 3. 写入链路(WAL → MemStore → HFile)

源码入口:`hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegion.java#put`

### 3.1 写入 5 步

```
Client
  |--- Put(row, cf:col, value) --> RPC 到 RS
                                     |
                                     v
                                1. 加 Region row lock(细粒度)
                                2. 加 row lock
                                3. 检查 MemStore 大小 → 是否触发 flush
                                4. 写 WAL (WALAppender.append)
                                5. 写 MemStore (MSLAB 分配)
                                6. 返回 Client 成功
```

### 3.2 WAL(Write-Ahead Log)

源码入口:`hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/wal/AbstractFSWAL.java`

- WAL 是 HDFS 上的 SequenceFile,以 append 方式写。
- Region Server 共享一个 WAL(默认)或每个 Region 独立 WAL(`hbase.wal.provider=asyncfs` + `hbase.regionserver.wal.asyncfs.config`)。
- WAL 文件大小超过 `hbase.regionserver.logroll.period`(默认 1 小时)或 `hbase.regionserver.maxlogs`(默认 32)时滚动。
- 数据恢复时,RegionServer 启动会 replay WAL 中的未 flush 数据到 MemStore。

**为什么先写 WAL?**
崩溃时,MemStore 内存中的数据全部丢失;但 WAL 已经持久化,可以 replay 恢复,**保证 ACID-D(持久性)**。

### 3.3 MemStore

源码入口:`hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/MemStore.java`

- MemStore 内部是 `ConcurrentSkipListMap<Cell>(row → cf → col → ts → value)`。
- **MSLAB(MemStore-Local Allocation Buffer)**:每个线程独立的 chunk,避免小对象在 young gen 碎片化导致频繁 Full GC。
- 写 MemStore 是纯内存操作,延迟在 μs 级。
- 当 MemStore 总大小达到 `hbase.hregion.memstore.flush.size`(默认 128 MB)时,标记为"待 flush",然后冻结(用 snapshot),下一个 MemStore 继续接收写入。

### 3.4 HFile

源码入口:`hbase-server/src/main/java/org/apache/hadoop/hbase/io/hfile/HFile.java`

HFile 内部结构(类似 Parquet 但细节不同):

```
+-----------------+
|  Magic "HFILE"  |
+-----------------+
|  Block Index    | (root/data/meta,存每块的 offset+key)
+-----------------+
|  Bloom Filter   |
+-----------------+
|  Block Data     | (Data Block 64 KB,默认)
+-----------------+
|  Trailer        | (block 索引汇总 + 各种偏移)
+-----------------+
```

- **Data Block**:默认 64 KB,存 KeyValue 单元(Key 包括 row/cf/col/ts/type)。
- **Bloom Filter**:Block 级别 Bloom,快速判断 row 是否在 Block 内,降低读 I/O。
- **Block Index**:Block 起点 offset + 第一行的 Key,二分查找定位 Block。
- **Trailer**:在文件末尾,启动时先读 Trailer 反查 Index。

---

## 4. Compaction

源码入口:`hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/CompactSplitThread.java` 与 `org/apache/hadoop/hbase/regionserver/compactions/CompactThroughputController.java`

### 4.1 为什么需要 Compaction?

每次 flush 都会产生一个新的 HFile,大量小 HFile 会导致:
- 读放大(1 个 row 可能分散在 10 个 HFile,每个都要查 + Bloom Filter)。
- 文件数限制(每个 Region HFile 数有上限,默认 `hbase.hstore.compactionThreshold=3` 触发合并)。

### 4.2 两种 Compaction

| 类型 | 行为 | 代价 | 适用 |
| --- | --- | --- | --- |
| Minor Compaction | 合并相邻几个 HFile(默认 3→1) | 小,持续进行 | 频繁,默认开 |
| Major Compaction | 合并该 CF 全部 HFile + 清理 TTL/删除标记 | 大,I/O 高,通常离线 | 周期执行 |

### 4.3 Compaction 调度策略

| 策略 | 含义 |
| --- | --- |
| `ratio-based` | 选择文件大小比合适的文件集 |
| `exploring` | 类似 ratio,但计算所有组合选最优(默认) |
| `stripe` | 把 Region 内 CF 分 stripe,类似 Kudu |
| `tiered` | FIFO + 老化,适合时序数据 |

### 4.4 故障案例:Compaction 卡住写入

**症状**:Region 写延迟飙升,日志出现 `Compaction too large`。
**根因**:Minor Compaction 选错文件集,合并后的文件接近 `max.filesize`。
**调优**:
```xml
<property>
  <name>hbase.regionserver.compaction.throttle</name>
  <value>200M</value>  <!-- 控制 compaction 带宽 -->
</property>
<property>
  <name>hbase.hstore.compaction.max.size.per.file</name>
  <value>2147483648</value>  <!-- 单文件 > 2 GB 不参与 minor -->
</property>
```

---

## 5. 读链路

源码入口:`hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegion.java#get`

### 5.1 读流程

```
Client
  |--- Get(row, cf:col) --> RPC 到 RS
                             |
                             v
                         1. 加 Region read lock
                         2. 检查 MemStore(可能有未 flush 的新数据)
                         3. 检查 BlockCache(LRU 缓存 HFile Block)
                         4. 检查每个 HFile 的 Bloom Filter
                         5. 二分定位 Block → 读 Block
                         6. 合并所有结果,返回最新版本
```

### 5.2 关键优化

- **BlockCache**:默认 LRUBlockCache(堆内),大数据量推荐 `hbase.bucketcache.combinedcache.enabled=true` + Offheap,容量 8–32 GB。
- **Bloom Filter**:把 Get 的 I/O 从 10 次降到 1–2 次。
- **HFile 索引下推**:Scan 时用 Index Only 读 Meta Block。
- **Reverse Scan**:HBase 2.x 支持反向 Scan,时序场景大幅加速。

### 5.3 故障案例:读延迟 P99 飙升

**症状**:Scan/Get 在某些 Region 上 P99 达几秒。
**排查**:
1. 看 RS 是否有 hot region(JMX:`RegionServer.getRegionServerCoprocessorHost()`)。
2. 检查 BlockCache 命中率(`hitRatio`),目标 > 95%。
3. 查 Slow Log(`hbase.regionserver.slowlog.ringbuffer.size=1024`)。
**调优**:
- 提高 BucketCache 大小到 RS 堆外内存的 50%。
- 调整 `hfile.block.cache.size=0.4`。
- 关闭 reverse scan,改用前缀 Scan。

---

## 6. Region 副本一致性(Region Replication)

HBase 2.x 起支持多 Region 副本(默认 1 副本)。

### 6.1 副本模型

- **默认模式**(`REPLICATION_SCOPE=0`):Region 单副本,MemStore 写即返回,WAL 异步复制(可选)。
- **异步复制模式**(`REPLICATION_SCOPE=1`):基于 WAL 复制,主备集群各一份,异步,可能丢失数据。

### 6.2 HBase 2.1+ 的 Region Server Group

把多个 RegionServer 编组,一个 Region 在一组里多副本,实现"同城多活"。

**启用**:
```bash
hbase(main):002:0> add_rs_group 'groupA'
hbase(main):003:0> move_rs_to_group 'rs1,rs2' 'groupA'
```

**写一致性**:使用异步复制,主 Region 写成功即返回,后台异步同步到同组其他副本。
**读一致性**:可配置读副本,提供 stale read(可能落后几毫秒)或 timeline-consistent(必须读到一致状态)。

### 6.3 三种一致性

| 模式 | 含义 | 代价 |
| --- | --- | --- |
| Strong | 必须读到所有副本都确认 | 高延迟 |
| Timeline | 必须读到时间戳一致 | 中等 |
| Stale | 任意副本,可能落后 | 低延迟 |

---

## 7. RowKey 设计

RowKey 设计是 HBase 性能的关键。**错误的 RowKey → 写入热点 → 整个集群退化为单 RegionServer**。

### 7.1 三大原则

1. **散列性**:RowKey 均匀分布,避免单调递增(如时间戳)导致热点。
2. **长度适中**:RowKey 越短越好(每个 KeyValue 都要存一份 RowKey),建议 16–64 字节。
3. **唯一性**:业务唯一键作为 RowKey,不要直接用业务字段拼接。

### 7.2 常用散列技巧

| 技巧 | 例子 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 加盐 | `prefix(salt) + rowkey` | 均匀分布 | 无法直接 Get,salt 范围要记录 |
| 哈希 | `md5(rowkey)` 前缀 | 均匀分布 | 不可逆,需要二次索引 |
| 字段反转 | `ts reversed + userId` | 时序范围查询友好 | 不适合随机 Get |
| 时间分段 | `20240101 + userId` | 按天分区,自然冷却 | 跨天查询需合并 |

### 7.3 实战:订单表 RowKey

```java
// 场景:订单号 + 用户 ID 查询
// 设计:反转 8 位哈希 + 类型 + userId
byte[] rowKey = Bytes.add(
    Bytes.toBytes(Long.toHexString(hash(orderId) ^ Long.MAX_VALUE).substring(0, 8)), // 8B 哈希散列
    Bytes.toBytes("01"),                                                          // 2B 类型(订单)
    Bytes.toBytes(userId)                                                          // 16B userId
);
```

---

## 8. 关键生产调优参数

```xml
<!-- hbase-site.xml -->
<property>
  <name>hbase.regionserver.handler.count</name><value>100</value>
</property>
<property>
  <name>hbase.hregion.memstore.flush.size</name><value>268435456</value>  <!-- 256 MB -->
</property>
<property>
  <name>hbase.regionserver.global.memstore.size</name><value>0.45</value>  <!-- 占堆 45% -->
</property>
<property>
  <name>hbase.hstore.blockingStoreFiles</name><value>30</value>
</property>
<property>
  <name>hbase.hstore.compactionThreshold</name><value>5</value>
</property>
<property>
  <name>hbase.bucketcache.size</name><value>32768</value>  <!-- 32 GB Offheap -->
</property>
<property>
  <name>hbase.bucketcache.bucket.sizes</name><value>4096,8192,16384,32768,65536</value>
</property>
<property>
  <name>hfile.block.cache.size</name><value>0.2</value>  <!-- 堆内 LRU -->
</property>
<property>
  <name>hbase.regionserver.maxlogs</name><value>64</value>
</property>
<property>
  <name>hbase.regionserver.logroll.period</name><value>3600</value>
</property>
```

---

## 9. 生产经验(踩坑清单)

| 踩坑 | 现象 | 解决 |
| --- | --- | --- |
| RowKey 热点 | 某个 RegionServer CPU/IO 打满 | 加盐或哈希散列 |
| MemStore 频繁 flush | Flush Queue 堆积 | 提高 `memstore.flush.size` 或扩容 |
| BlockCache 命中低 | 读 P99 飙升 | 提高 `bucketcache.size` |
| Compaction 卡写入 | 写延迟升高 | 降低 compaction 带宽或增加 max.size.per.file |
| WAL 同步慢 | 写延迟不稳定 | 启用 `asyncfs` |
| Meta 表分裂 | 元数据访问失败 | 提高 `hbase.meta.replica.count=3` |

---

## 10. 实战任务

### 任务 1:伪分布式 HBase

```bash
docker run -d --name hbase -p 16010:16010 -p 2181:2181 \
  -e HBASE_MANAGES_ZK=true \
  harisekhon/hbase:latest
```

### 任务 2:用 Java API 写入 100 万条

```java
Configuration conf = HBaseConfiguration.create();
conf.set("hbase.zookeeper.quorum", "localhost");
Connection conn = ConnectionFactory.createConnection(conf);
Table t = conn.getTable(TableName.valueOf("test"));
List<Put> puts = new ArrayList<>();
for (int i = 0; i < 1000000; i++) {
  Put p = new Put(Bytes.toBytes(i));
  p.addColumn(Bytes.toBytes("cf"), Bytes.toBytes("v"), Bytes.toBytes(i));
  puts.add(p);
}
t.put(puts);
```

观察 HMaster UI:`http://localhost:16010`,看 Region 分布。

### 任务 3:制造热点 vs 散列对比

```java
// 热点:单调 RowKey
Put p1 = new Put(Bytes.toBytes(System.currentTimeMillis()));

// 散列:RowKey 加盐
int salt = ThreadLocalRandom.current().nextInt(100);
Put p2 = new Put(Bytes.toBytes(salt + ":" + userId));
```

观察 RegionServer 写入 IO 是否均衡。

---

## 11. 专家面试题(5 题)

1. **HBase 写入为什么先写 WAL 再写 MemStore?如果 MemStore 写成功但 WAL 写失败会怎样?**
2. **Minor Compaction 与 Major Compaction 区别是什么?为什么 Major 不常做?**
3. **Region Server 故障后,数据如何恢复?WAL replay 的过程细节是什么?**
4. **如何设计 RowKey 避免热点?举例说明加盐 / 哈希 / 反转三种方案。**
5. **BlockCache + Bloom Filter 在读路径上各自起什么作用?BucketCache 与 LRUBlockCache 区别?**

---

## 12. 本章小结

- HBase 是"大数据 KV + LSM"的代表,**写入友好、随机读友好,全表扫描弱**。
- 核心组件:**WAL(持久化)→ MemStore(写入)→ HFile(查询)→ Compaction(后台合并)**。
- RowKey 设计 + 副本策略 + Compaction 调优是生产重点。
- 下一章对比 **Kudu**(另一种 LSM 列存)与 HBase、Iceberg 的差异。

下一章:[03-Kudu 与列存储对比](./03-kudu-column-store.md)