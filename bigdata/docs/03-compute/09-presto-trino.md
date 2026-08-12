# 09. Presto/Trino 原理与 MPP 引擎

> **本章定位**:Presto/Trino 是"无状态 MPP 查询引擎"的代表,Facebook 2013 年开源,Trino 是 2020 年 fork 出的活跃分支。本章深入 Coordinator / Worker / Discovery 三层架构、Connector SPI、Split / Page 模型、Operator Pipeline、Hive Connector 细节。

---

## 1. Presto/Trino 整体架构

```
 ┌──────────────────────────────────────────────────────────────┐
 │                       Coordinator                            │
 │   - 接收 SQL、解析、规划、调度、聚合                          │
 │   - 维护 ClusterStatus / NodeManager                        │
 │   - 与 Discovery Server 通信(节点发现)                       │
 └─────────────┬────────────────────────────────────────────────┘
               │ HTTP/RPC
               ▼
 ┌──────────────────────────────────────────────────────────────┐
 │                       Worker  (无状态)                       │
 │   - 执行 Stage / Task                                       │
 │   - 通过 Connector SPI 拉数据                                │
 │   - Operator Pipeline(火山模型 + 向量化)                     │
 │   - Exchange(数据交换)                                      │
 └─────────────┬────────────────────────────────────────────────┘
               │
               ▼
 ┌──────────────────────────────────────────────────────────────┐
 │                       Connector                              │
 │   - Hive / Iceberg / MySQL / Kafka / Redis / MongoDB         │
 │   - 物理元数据 + Split 切分                                  │
 └──────────────────────────────────────────────────────────────┘
```

### 1.1 关键设计理念

| 设计 | 含义 |
| --- | --- |
| 无状态 Worker | Worker 不存数据,数据在 HDFS / S3 / JDBC 端,Worker 挂了换一台 |
| Pipeline 模型 | Operator 串成 pipeline,数据 Page 流式处理 |
| Connector SPI | 抽象"数据在哪里",让 Trino 支持多种数据源 |
| Coordinator 调度 | 全局视角,Stage 级别调度 |

---

## 2. Discovery Server

源码:`io.trino.discovery.DiscoveryServer`

```
DiscoveryServer:
   ├─ 注册节点:Worker / Coordinator 启动时注册
   ├─ 节点类型:ACTIVE / INACTIVE
   ├─ 节点状态:CPU/内存/Coordinator URL
   └─ 心跳:每 30s 一次
```

源码:`presto-discovery-server` 模块,基于 HTTP REST API。

---

## 3. Coordinator 详解

源码:`io.trino.server.TrinoServer`(Coordinator 端)

### 3.1 Coordinator 启动流程

```
Trino Server 启动:
   ├─ PluginManager(加载 connector 插件)
   ├─ MetadataManager(注册 catalog)
   ├─ SqlParserManager(ANTLR)
   ├─ Analyzer
   ├─ Planner
   ├─ DistributedStagesScheduler
   └─ ServerMainModule
```

### 3.2 SQL 处理流程

源码:`io.trino.server.protocol.Query#createQuery`

```
   1. 用户提交 SQL(POST /v1/statement)
   2. QueryManager.createQuery
   3. SqlParser.parse
   4. Analyzer.analyze
   5. Planner.plan
   6. DistributedStagesScheduler.schedule
   7. Stage 拆分 → Task → Worker
   8. Worker 拉数据 → Exchange → Coordinator 聚合
   9. 结果返回客户端(分页 / 流)
```

---

## 4. Query Planning

### 4.1 Logical Plan

```
SQL: SELECT region, SUM(amount)
     FROM orders
     WHERE ts > '2026-01-01'
     GROUP BY region
```

Logical Plan(树状 RelNode):

```
Aggregate(functions=[sum(amount)], groupBy=[region])
   └─ Filter(ts > '2026-01-01')
       └─ TableScan(orders)
```

源码:`io.trino.sql.planner.LogicalPlanner`。

### 4.2 Optimizer

源码:`io.trino.sql.planner.iterative.IterativeOptimizer`(200+ 规则)。

| 规则类型 | 例子 |
| --- | --- |
| Predicate Pushdown | Filter 下推到 Scan |
| Projection Pushdown | Project 字段裁剪 |
| Join Reorder | 动态规划 + Cost 优化 |
| Aggregation Pull-up | 聚合上推 |
| Subquery Decorrelation | 子查询去相关 |

### 4.3 Physical Plan

```
Output(PartitionedOutput, region + sum)
   └─ LocalExchange(hashPartitionBy=region)
       └─ LocalAggregate
           └─ RemoteExchange(hashPartitionBy=region)
               └─ PartialAggregate
                   └─ ScanFilterProject
                       └─ TableScan(orders)
```

源码:`io.trino.sql.planner.plan.PlanFragment`。

### 4.4 Fragment 与 Stage

```
Fragment 1: Output + LocalAggregate + LocalExchange + RemoteExchange
            (Coordinator 端)
Fragment 2: PartialAggregate + ScanFilterProject + RemoteExchange
            (Worker 端)
```

每个 Fragment = 一个 Stage = 一组 Task。

源码:`io.trino.execution.StageInfo`。

---

## 5. Connector SPI

### 5.1 SPI 接口

源码:`io.trino.spi.connector.ConnectorMetadata` / `ConnectorRecordSetProvider`

```java
public interface ConnectorMetadata {
    List<String> listSchemaNames(ConnectorSession session);
    ConnectorTableHandle getTableHandle(SchemaTableName tableName);
    ConnectorTableMetadata getTableMetadata(ConnectorTableHandle table);
    Map<String, ColumnHandle> getColumnHandles(ConnectorSession session, ConnectorTableHandle tableHandle);
    // ...
}

public interface ConnectorRecordSetProvider {
    RecordSet getRecordSet(ConnectorTransactionHandle transactionHandle,
                          ConnectorSession session,
                          ConnectorSplit split,
                          List<? extends ColumnHandle> columns);
}
```

### 5.2 Connector 实现

```
io.trino.plugin.hive.HiveConnector
io.trino.plugin.iceberg.IcebergConnector
io.trino.plugin.mysql.MySqlConnector
io.trino.plugin.kafka.KafkaConnector
io.trino.plugin.jdbc.JdbcConnector  (通用 JDBC)
```

### 5.3 自定义 Connector

```java
public class MyConnector implements Connector {
    @Override
    public ConnectorMetadata getMetadata(ConnectorMetadataHandle metadataHandle) {
        return new MyConnectorMetadata();
    }
    
    @Override
    public ConnectorRecordSetProvider getRecordSetProvider() {
        return new MyRecordSetProvider();
    }
}
```

注册:`etc/catalog/my.properties`:

```properties
connector.name=my-connector
connection-url=jdbc:mysql://mysql-host:3306/mydb
connection-user=root
connection-password=password
```

---

## 6. Split 模型

### 6.1 Split 概念

Split = 数据源的最小处理单元。比如 Hive 表 100 GB,Trino 会切 200 个 split(每个 500 MB)。

```java
public interface ConnectorSplit {
    boolean isRemotelyAccessible();
    List<HostAddress> getAddresses();
    Object getInfo();
}
```

### 6.2 Split 调度

源码:`io.trino.execution.SqlTaskExecution`

```
   1. Coordinator 拿到所有 split
   2. 按 Locality 拆分(split 在哪个 Worker 节点)
   3. 通过 StageScheduler 把 Task 下发到 Worker
   4. Worker 跑 Task,每个 Task 处理若干 split
```

调度策略:`io.trino.scheduler:`:
- `StageScheduler` — Stage 级别调度。
- `SourcePartitionedScheduler` — 按 Node 分裂。

---

## 7. Page 模型

### 7.1 Page 概念

Page = 一批 row,每个 row 由若干 block 组成(block 是列存)。

```
Page (Block[]):
   Block0: Region = [Beijing, Beijing, Shanghai, Beijing, ...]
   Block1: Amount = [100, 200, 150, 300, ...]
   Block2: Ts = [2026-01-01, 2026-01-02, ...]
```

源码:`io.trino.spi.Page` + `io.trino.spi.block.Block`。

### 7.2 Block 类型

| Block 类型 | 用途 |
| --- | --- |
| `IntArrayBlock` | int 列 |
| `LongArrayBlock` | long 列 |
| `DictionaryBlock` | 字典编码 |
| `RunLengthBlock` | RLE 编码(常量列) |
| `LazyBlock` | 延迟加载 |

源码:`io.trino.spi.block.BlockFactory`。

### 7.3 Page 来源

```java
// Hive Connector 读 HDFS File
ConnectorRecordSetProvider.getRecordSet(...)
  → HiveRecordSet
  → OrcRecordReader
  → Page(byteBuffer[])

// JDBC Connector
  → JdbcRecordSet
  → Page(row/column)
```

---

## 8. Operator Pipeline

### 8.1 火山模型

源码:`io.trino.operator.Operator`

```java
public interface Operator {
    boolean needsInput();      // 是否还需要 input
    void addInput(Page page);  // 添加一个 Page
    Page getOutput();          // 获取处理后的 Page
    void close();
}
```

### 8.2 Pipeline 执行

```
ScanOperator → FilterOperator → ProjectOperator → AggregatorOperator → ExchangeOperator
   ↓                 ↓                ↓                  ↓                ↓
 input Page    filter Page    project Page       aggregate Page   forward Page
```

源码:`io.trino.operator.Driver`。

### 8.3 Driver 主循环

源码:`io.trino.operator.Driver#process`

```java
while (!isDone) {
    boolean hasNewInput = !inputPages.isEmpty();
    if (hasNewInput) {
        Page page = inputPages.remove();
        currentOperator.addInput(page);
    } else {
        currentOperator.finish();  // 通知上游已完成
    }
    Page output = currentOperator.getOutput();
    if (output != null) {
        nextOperator.addInput(output);
        moveToNextOperator();
    } else if (currentOperator.isBlocked()) {
        // 等待 IO(比如 split 还没读完)
        blockedFuture.get();
    } else if (noMoreOperators()) {
        // 所有 operator 完成
        isDone = true;
    }
}
```

### 8.4 Operator 类型

源码位置:`io.trino.operator.OperatorFactory`

| Operator | 作用 |
| --- | --- |
| `TableScanOperator` | 读表 |
| `FilterOperator` | WHERE |
| `ProjectOperator` | SELECT |
| `HashAggregationOperator` | GROUP BY |
| `HashJoinOperator` | JOIN |
| `ExchangeOperator` | 数据交换 |
| `TopNOperator` | ORDER BY + LIMIT |
| `TableWriterOperator` | INSERT |

---

## 9. Exchange(数据交换)

源码:`io.trino.operator.ExchangeOperator`

### 9.1 Exchange 三种模式

| 模式 | 含义 |
| --- | --- |
| GATHER | 收集到单个 Task |
| REPARTITION | hash / range 分发 |
| BROADCAST | 广播到所有 Task |

### 9.2 Exchange 协议

- `OutputBuffer` 在 Source Task 端,缓存要输出的 Page。
- `InputBuffer` 在 Target Task 端,从 OutputBuffer 拉数据。
- 序列化:`Page` 序列化为 `Slice`,通过 Netty HTTP / Thrift 传输。

源码:`io.trino.execution.buffer.OutputBuffer`。

---

## 10. Hive Connector 深度解析

### 10.1 Hive Connector 架构

```
io.trino.plugin.hive:
   ├─ HiveConnector
   ├─ HiveMetadata
   ├─ HiveRecordSetProvider
   ├─ HiveSplit
   ├─ HivePageSource
   └─ HiveWriter
```

### 10.2 Hive Split 切分

源码:`io.trino.plugin.hive.BackgroundHiveSplitLoader`

```java
class HiveSplit {
    String path;            // HDFS 路径
    long start;             // 文件偏移
    long length;            // 文件长度
    List<HivePartitionKey> partitionKeys;
    // ORC/Parquet footer + 元数据
}
```

切分流程:
1. 读 Hive MetaStore 拿到 partition 信息。
2. 对每个 part file,按行组(ORC)或块(Parquet)切 split。
3. split 数 = `estimated_size / split.target-size`(默认 1 GB)。

### 10.3 Hive ORC 读取

源码:`io.trino.plugin.hive.orc.OrcPageSource`

```
Hive ORC PageSource 读取:
   1. 打开 ORC 文件,读 footer(stripe 信息 + 列统计)
   2. stripe 内部按 row group 读取
   3. 对 row group 解压 + 反序列化 + 投影下推
   4. 输出 Page(Block[])
```

### 10.4 Hive 分区裁剪

```sql
SELECT * FROM orders WHERE dt = '2026-01-01'
```

`HiveMetadata#getTableHandle` 解析 dt 条件,过滤 partition 列表,只读满足条件的 partition。

源码:`io.trino.plugin.hive.metastore.SemiTransactionalHiveMetastore`。

### 10.5 Hive 写入

```sql
CREATE TABLE hive.new_orders WITH (
  format = 'ORC',
  external_location = 'hdfs:///data/new_orders'
) AS SELECT * FROM source;
```

源码:`io.trino.plugin.hive.HiveWriterFactory`。

---

## 11. Iceberg Connector

源码:`io.trino.plugin.iceberg.IcebergConnector`

```sql
CREATE TABLE iceberg.mydb.orders (
  order_id BIGINT,
  amount DECIMAL(10, 2),
  ts TIMESTAMP
) WITH (
  format = 'PARQUET',
  partitioning = ARRAY['days(ts)']
);
```

特性:
- 隐藏分区(`days(ts)` 自动转换)。
- Time Travel:`SELECT * FROM orders FOR TIMESTAMP AS OF TIMESTAMP '2026-01-01'`
- Schema Evolution:增删字段不影响历史数据。
- 事务:Copy-on-Write + Merge-on-Read。

源码:`io.trino.plugin.iceberg.IcebergPageSource`。

---

## 12. Presto vs Trino 关键差异

| 维度 | Presto | Trino |
| --- | --- | --- |
| 主版本 | PrestoDB (停滞) | Trino(活跃) |
| 创始团队 | Facebook → 内部转向 | 2020 年 fork |
| SQL 方言 | PrestoSQL | 标准 ANSI SQL |
| 社区 | 已分裂 | 活跃 |
| 性能 | 类似 | 类似 |
| 生产推荐 | ❌ | ✅ |

---

## 13. 生产参数清单

`etc/config.properties`:

```properties
coordinator=true
node-scheduler.include-coordinator=false
http-server.http.port=8080
query.max-memory=50GB
query.max-memory-per-node=8GB
query.max-total-memory-per-node=10GB

discovery-server.enabled=true
discovery.uri=http://discovery-server:8080

# Worker
coordinator=false
discovery.uri=http://discovery-server:8080
```

`etc/jvm.config`:

```
-server
-Xmx16G
-XX:+UseG1GC
-XX:G1HeapRegionSize=32M
```

---

## 14. 生产实战任务

### 14.1 任务一:Trino CLI 查询 Hive

```bash
# code/presto/query-hive.sh
trino-cli \
  --server https://trino-coordinator:8080 \
  --catalog hive \
  --schema default \
  --execute "
    SELECT
      region,
      SUM(amount) AS gmv,
      COUNT(DISTINCT user_id) AS users
    FROM orders
    WHERE dt >= '2026-01-01'
    GROUP BY region
    ORDER BY gmv DESC
  "
```

### 14.2 任务二:Iceberg Time Travel

```sql
-- 当前表
SELECT * FROM iceberg.mydb.orders;

-- 历史 snapshot
SELECT * FROM iceberg.mydb.orders FOR TIMESTAMP AS OF TIMESTAMP '2026-01-01 00:00:00';

-- 特定 snapshot-id
SELECT * FROM iceberg.mydb.orders FOR VERSION AS OF 1234567;
```

### 14.3 任务三:自定义 JDBC Connector

`etc/catalog/mysql.properties`:

```properties
connector.name=mysql
connection-url=jdbc:mysql://mysql-host:3306
connection-user=root
connection-password=password
```

```sql
-- 联邦查询 Hive + MySQL
SELECT
  h.order_id,
  h.amount,
  u.user_name
FROM hive.mydb.orders h
JOIN mysql.mydb.users u
  ON h.user_id = u.id
WHERE h.dt = '2026-01-01';
```

### 14.4 任务四:Trino + Kafka Connector

`etc/catalog/kafka.properties`:

```properties
connector.name=kafka
kafka.table-names=orders,users
kafka.nodes=kafka:9092
```

```sql
SELECT * FROM kafka.default.orders;
```

### 14.5 任务五:Observer 监控

```bash
# Web UI
http://coordinator:8080/

# 看:
# - Queries:活跃 / 历史查询
# - Stages:Stage 调度
# - Operator:每个 operator 输入输出 / 时长
# - Memory:Coordinator / Worker 内存
```

---

## 15. 专家面试题

1. **Presto 和 Trino 的本质?**
   *要点*:都是无状态 MPP 引擎,Worker 无数据,数据在底层(Hive/Iceberg/MySQL)。PrestoDB 已停滞,Trino 活跃。
2. **Coordinator 和 Worker 的职责?**
   *要点*:Coordinator 接收 SQL、解析、规划、调度、聚合;Worker 执行 Stage / Task,通过 Connector 拉数据。
3. **Page 模型的好处?**
   *要点*:批量(列存)比 Volcano 模型单行减少虚函数调用,内存带宽提升。Block 是列存压缩基础。
4. **Split 是什么?**
   *要点*:数据源的最小处理单元,Hive 切到 row group / 文件块;Trino 按 Locality 调度到 Worker。
5. **Operator Pipeline 如何工作?**
   *要点*:火山模型 + Driver 主循环,每个 operator 处理 Page 后传给下一个,适合 IO/CPU 重叠。
6. **Connector SPI 的核心接口?**
   *要点*:`ConnectorMetadata`(元数据) + `ConnectorRecordSetProvider`(读数据)。Source 端 4 个接口,Sink 端 4 个接口。
7. **Hive Connector 如何分区裁剪?**
   *要点*:`HiveMetadata` 读 MetaStore partition,通过 WHERE 条件过滤,只读命中 partition 的 HDFS 路径。
8. **Trino 与 Spark SQL 的区别?**
   *要点*:Trino 是查询引擎(无存储),Spark 是 ETL 引擎;Trino 调度更细,Spark 重 DAG 优化。
9. **为什么 Trino 用 Discovery Server?**
   *要点*:Worker 节点动态伸缩,Coordinator 通过 Discovery Server 发现 Worker;Worker 注册 / 注销自动生效。
10. **Trino 的内存配置分几层?**
    *要点*:Coordinator 端 `query.max-memory`(查询总内存)、`query.max-memory-per-node`(单节点);Worker 端类似。
11. **Iceberg Connector 的优势?**
    *要点*:ACID 事务、Time Travel、Schema Evolution、Hidden Partition;比 Hive 表更现代,2024 后湖仓一体首选。
12. **Trino 调度为什么比 Spark 慢?**
    *要点*:Trino Stage / Task / Split 三级调度,Stage 数量多时调度开销大;Spark 一个 Stage 跑完才调度下一个。
13. **Trino 与 Doris 的对比?**
    *要点*:Trino 是无存储 MPP 引擎,数据在外部(Hive/Iceberg);Doris 是自包含 MPP 数据库(FE+BE 自带存储)。Trino 强在联邦查询,Doris 强在实时写入。
14. **Trino 的 Page 序列化协议?**
    *要点*:Page → Slice → Netty HTTP / Thrift 传输,压缩 + 编码后约 100MB / 秒 / Worker。
15. **Trino 怎么调优 Stage 数?**
    *要点*:Stage 数 = fragment 数,每个 fragment 一个 Stage。EXPLAIN 看到多个 Stage 是因为 Exchange 切换(LocalExchange + RemoteExchange)。

---

## 16. 一张图回顾 Trino 架构

```
   Client(CLI / JDBC)
       │
       ▼ HTTP REST
   ┌─────────────────────────────────────────┐
   │            Coordinator                  │
   │  SQL → Parser → Analyzer → Planner      │
   │         Optimizer (RBO + CBO)            │
   │         PlanFragment                     │
   │         StageScheduler                   │
   │         DistributedStagesScheduler        │
   └──────────────┬──────────────────────────┘
                  │ Thrift RPC
        ┌─────────┴──────────┐
        ▼                    ▼
   ┌──────────┐         ┌──────────┐
   │ Worker 1 │         │ Worker 2 │  ... Worker N
   │  Task   │         │  Task    │
   │  Driver │         │  Driver  │
   │  Opr.   │         │  Opr.    │
   │  Pipe   │         │  Pipe    │
   └────┬─────┘         └────┬─────┘
        │                    │
        └────────┬───────────┘
                 ▼
        Connector SPI
                 │
   ┌─────────┬───┴────┬─────────┐
   ▼         ▼        ▼         ▼
 Hive    Iceberg   MySQL     Kafka
   │         │        │         │
   └─ HDFS ─┴─ S3 ───┴─ JDBC ──┘
```

---

## 17. 小结与下一章预告

- Trino = Coordinator(调度) + Worker(无状态执行) + Connector(数据源) + Page/Block(内存抽象)。
- Pipeline 模型 + Connector SPI 是 Trino 的精髓。
- 下一章 [10-Doris/StarRocks 原理与调优],我们进入"自包含 MPP 数据库"代表,看 FE / BE / Catalog、Colocation Join、Bucketed Shuffle Join、Bitmap Index、Insert Into 自适应。