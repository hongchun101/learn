# Module 05 · Hive 数仓引擎

> 这一章回答"Hive 是什么、为什么大厂还在用、Hive 在数仓分层里扮演什么角色"。引擎层只关心 SQL-on-Hadoop 的公共契约：建表、加载、分区、分桶、ORC、UDF、CBO、性能调优。所有 demo 跑在 DuckDB 上（in-memory，无集群），Hive-only 语法用 `-- @hive:` 注释对照真 Hive DDL。

读完这一章你能：

- 画出 Hive 整体架构，理解 Driver/CBO/MetaStore 的协作
- 用 `CREATE EXTERNAL TABLE` / `PARTITIONED BY` / `CLUSTERED BY` / `STORED AS ORC` 写生产 DDL
- 区分分区与分桶，知道什么时候用哪个、能省多少 IO
- 对比 ORC vs Parquet，给出选型决策
- 写 UDF / UDAF / UDTF 并解释 GenericUDF 的运行机制
- 解释 CBO 的输入（统计信息）与输出（plan cost）
- 给出 Hive 性能调优"十大招"

## 章节

- [ch01 · Hive 架构](#ch01--hive-架构)
- [ch02 · MetaStore](#ch02--metastore)
- [ch03 · DDL/DML](#ch03--ddldml)
- [ch04 · 分区与分桶](#ch04--分区与分桶)
- [ch05 · ORC vs Parquet](#ch05--orc-vs-parquet)
- [ch06 · UDF/UDAF/UDTF](#ch06--udfudafudtf)
- [ch07 · CBO 与 Tez](#ch07--cbo-与-tez)
- [ch08 · 性能调优十大招](#ch08--性能调优十大招)

## 快速开始

```bash
python shared/generate_data.py --scale small
duckdb < modules/05-hive/src/hive_demo.sql
python -m pytest modules/05-hive/tests/ -v
```

---

## ch01 · Hive 架构

```
   Client ──Thrift── HS2 ──Thrift── Driver
                   Compiler / CBO         MetaStore → RDBMS
                       │                        │
                ExecutionEngine (MR/Tez/Spark/LLAP)
                                │
                       HDFS / S3 / OSS
```

- **Driver**：SQL 经 Parser → Analyzer → Plan → Optimizer → Physical Plan 五阶段，每阶段产物都可在 `EXPLAIN` 里看到。
- **CBO**：Hive 1.x rule-based；Hive 2.x 引入 Apache Calcite 后才真正"基于代价"做 join reorder / aggregate pushdown。
- **Execution Engine** 插拔：早期 MapReduce（每 stage 起 JVM、磁盘交换），Hive 2.x 默认 **Tez**（DAG、内存流水），Hive 3 推 **LLAP**（长驻进程 + cache + 协处理）。
- **MetaStore**：独立进程/服务，后面挂 RDBMS（MySQL/Postgres），**不是 Hive 自带**。

**Hive 不是数据库**——它把 SQL 翻译成分布式计算任务；数据存 HDFS，计算靠 MR/Tez/Spark。

---

## ch02 · MetaStore

MetaStore 是 Hive 的"配置中心"，所有表、分区、列类型、SerDe、文件路径都在这里登记。三层结构：

| 层 | 形态 | 用途 |
|---|---|---|
| **MetaStore Server** | Thrift 服务（独立 JVM） | 对外 API；HS2/Spark/Flink/Presto 都连 |
| **MetaStore Client** | 各 client 内的 stub | 启动时连一次，本地缓存 |
| **DB Store** | MySQL / Postgres | `DBS`、`TBLS`、`PARTITION_KEYS`、`SDS`、`COLUMNS_V2` |

**三个关键事实**：(1) MetaStore **单点**：原生不支持 HA，生产要么外部共享 DB + 多 server 实例，要么用 HMS Plug-in（Glue / Polaris）。 (2) MetaStore **慢**：`ALTER TABLE ADD COLUMN` 走全表 DDL；分区爆炸（>10w）让 `getPartitions` 退化成单条 SQL。 (3) MetaStore **是数据湖目录的事实标准**：Spark、Flink、Trino、Presto、Fivetran 都直连；Iceberg/Hudi 早期 catalog 也对接它。

---

## ch03 · DDL/DML

```sql
-- Hive 真实写法
CREATE EXTERNAL TABLE dwd.orders (
    order_id BIGINT, user_id BIGINT,
    total    DECIMAL(18,2), status STRING)
PARTITIONED BY (dt STRING)
CLUSTERED BY (user_id) INTO 16 BUCKETS
STORED AS ORC
TBLPROPERTIES ('orc.compress'='ZSTD');

-- DuckDB 等价（本章 demo）
CREATE OR REPLACE TABLE dwd.orders AS
SELECT order_id, user_id, CAST(total AS DECIMAL(18,2)) AS total, status, dt
FROM ods.orders;
```

**DML 关键字差异**：

| 关键字 | Hive 语义 | RDBMS 差异 |
|---|---|---|
| `INSERT INTO ... VALUES` | 1.2 起支持但**性能差**——每个 VALUES 起一个 file | PG/MySQL 标准用法 |
| `INSERT INTO ... SELECT` | 真正的工作方式 | 同 |
| `LOAD DATA INPATH` | 把 HDFS 文件移动/复制到表目录下 | 没有等价物 |
| `MSCK REPAIR TABLE` | 同步"已存在但 MetaStore 不知道"的文件为分区 | 没有等价物 |

**两个反直觉**：(1) Hive **没有行级 update/delete**（直到 0.14 才支持 ACID，且严重依赖 ORC + 事务管理器），生产数仓基本只用 `INSERT OVERWRITE` 重写整个分区。 (2) Hive 的 `WHERE` 不触发"索引查找"——列存下推靠 **min/max 索引**（ORC/Parquet 自带）和 **分区裁剪**，不是 B-tree。

---

## ch04 · 分区与分桶

### 分区（Partition）

- **物理上**：HDFS 上一级目录，`dt=2024-01-15/`、`dt=2024-01-16/`
- **作用**：把"经常出现在 WHERE 里的列"提到目录层级。`WHERE dt='2024-01-15'` 直接跳到对应子目录，**省 99%+ IO**
- **代价**：分区列不能参与 `DISTRIBUTE BY`；取值基数不能太高（>1w 爆炸）
- **场景**：时间、地域、业务线

```sql
ALTER TABLE dwd.orders ADD PARTITION (dt='2024-01-15');
ALTER TABLE dwd.orders DROP PARTITION (dt='2024-01-15');
MSCK REPAIR TABLE dwd.orders;
```

### 分桶（Bucket / Cluster）

- **物理上**：每个分区内拆出 N 个文件，每个文件存哈希到该桶的行
- **作用**：**同 key 必同桶**，两个桶对齐的表做 `JOIN` 是 no-shuffle merge；`SAMPLE` 可直接按桶切
- **代价**：写入时多一次 hash + sort；bucket 数选错就完蛋
- **场景**：join key / 高基数 group by key / 抽样 key

```sql
CLUSTERED BY (user_id) INTO 16 BUCKETS
-- Hive 内部: bucket_id = hash(user_id) % 16
```

### 对比

| 维度 | 分区 | 分桶 |
|---|---|---|
| 切分依据 | 业务列（dt / region） | hash（user_id） |
| 减少 IO | 整段目录跳过 | 不会（数据仍全量读，靠 hash 排好序） |
| 加速 JOIN | 一般 | **巨大**（同桶 = 同文件） |
| 选错代价 | 分区爆炸 | 小文件 / 数据倾斜 |

**经验法则**：分区按"扫描维度"选，分桶按"join/sampling 维度"选。两者可叠加：`PARTITIONED BY (dt) CLUSTERED BY (user_id) INTO 16 BUCKETS`。

---

## ch05 · ORC vs Parquet

ORC 和 Parquet 都是 Hadoop 生态的列存格式——按列连续存、min/max 索引、谓词下推。差异在工程细节：

| 维度 | ORC | Parquet |
|---|---|---|
| 来源 | Hortonworks | Twitter + Cloudera |
| 列存粒度 | stripe（64MB）→ row group → 10k batch | row group（128MB）→ column chunk → page |
| 索引 | min/max + bloom + 位置索引（自带） | min/max（每 page），bloom 由外部加 |
| 压缩 | 默认 ZLIB，可 ZSTD/Snappy/LZO | 默认 Snappy，可 ZSTD/GZIP |
| 读端生态 | Hive/Spark/Presto/Trino | **更广**——Arrow/Pandas/Polars/DuckDB/Iceberg |
| 写端生态 | Hive 写入最稳 | Spark/Trino/DuckDB 写更顺 |

**选型决策**：

- **Hive 主写、Hive 主读**：ORC（自带 bloom、ACID 事务友好）
- **跨引擎读写、需要 Iceberg/Delta**：Parquet（生态更广，Arrow 链路零拷贝）
- **冷数据归档**：ORC + ZSTD（压缩比略高）
- **小文件密集、流式追加**：Parquet（row group 调整更灵活）

> 本章 demo 用 Parquet + ZSTD 模拟 ORC 的列存+ZSTD 行为；详见 `hive_demo.sql` 第 (5) 段。

---

## ch06 · UDF/UDAF/UDTF

| 类型 | 输入 | 输出 | 实现类 | 典型场景 |
|---|---|---|---|---|
| **UDF** | 1 行 N 列 | 1 行 1 列 | `GenericUDF` | 字符串处理、加密脱敏 |
| **UDAF** | N 行 1 列 | 1 行 1 列 | `GenericUDAFResolver2` | 自定义聚合（去重计数、分位数） |
| **UDTF** | 1 行 N 列 | N 行 M 列 | `GenericUDTF` | 切分、explode、URL 解析 |

```sql
ADD JAR /opt/hive/udf/mask-email.jar;
CREATE TEMPORARY FUNCTION mask_email AS 'com.x.hive.udf.MaskEmail';
SELECT user_id, mask_email(email) FROM users;

-- UDTF: explode
SELECT user_id, tag
FROM user_profile
LATERAL VIEW explode(split(interests, ',')) t AS tag;
```

**性能注意点**：UDF **无法下推到存储层**——数据全读上来再算；ORC 的 min/max bloom 都帮不上。UDAF 在 map 阶段跑，**数据倾斜时单 UDAF 实例成为瓶颈**——启用 `set hive.groupby.skewindata=true`。UDTF **会把一行炸成多行**，其它列被"复制"，**有 ROW_NUMBER 爆炸风险**——务必加 LIMIT。

> 本章 demo 用 DuckDB 的 `CREATE MACRO` 模拟三类函数；`MACRO` 等价 UDF，`MACRO ... AS TABLE` 等价 UDTF。详见 `hive_demo.sql` 第 (6) 段。

---

## ch07 · CBO 与 Tez

### 执行引擎三代

| 代际 | 引擎 | 算子模型 | 缺点 |
|---|---|---|---|
| **1.x** | MapReduce | 每 stage 一个 JVM，写 HDFS 再读 | 慢，磁盘 IO 爆炸 |
| **2.x 默认** | **Tez** | DAG，多 stage 内存流水 | 仍有 shuffle 落盘 |
| **3.x** | **LLAP** | 长驻进程 + cache + 协处理 | 资源占用高 |

Tez 把 MapReduce 的"两阶段"压成 **DAG**：filter→join→aggregate→sink 一条流水线跑完，**不再每段写 HDFS**。

### CBO

Hive 1.x 只有 RBO（rule-based）：规则写死，无法感知"a 表 100 行、b 表 1 亿行"。Hive 2.x 引入 Calcite 后补齐 CBO。

CBO 的输入：

```sql
ANALYZE TABLE dwd.orders COMPUTE STATISTICS;
ANALYZE TABLE dwd.orders COMPUTE STATISTICS FOR COLUMNS;
```

CBO 的输出：基于代价选择 join 顺序、join 算法（map join vs shuffle hash join vs sort merge join）、repartition 阈值。

```sql
set hive.cbo.enable=true;
set hive.compute.query.using.stats=true;
set hive.stats.fetch.column.stats=true;
```

**实测收益**：开启 CBO 后，多 join 的 query 提速 2-10x 是常态——它只是"选对了 join 顺序"而已。

---

## ch08 · 性能调优十大招

按 ROI 从高到低排：

1. **分区裁剪**：把 dt 加 `PARTITIONED BY`，`WHERE dt='...'` 直接跳过 99% 数据。**改 1 行 DDL，省 90% IO**。
2. **列存 + 压缩**：ORC + ZSTD（默认 ZLIB 慢）。列存自带 min/max 跳过 row group。
3. **Map Join**：把小表广播到大表所在 JVM，省掉 shuffle。`set hive.auto.convert.join=true`。
4. **倾斜 Join**：热点 key 加盐打散——`concat(key, '_', floor(rand()*10))`。先随机 join 再聚合。
5. **倾斜 Group By**：开 `set hive.groupby.skewindata=true`——自动拆两阶段聚合。
6. **合理分桶**：高频 join key 设 `CLUSTERED BY` + bucket 数 = `2 * reducer_capacity`。避免 ≤ 256 / > 2048。
7. **Vectorization**：`set hive.vectorized.execution.enabled=true`——CPU 密集查询提速 3-5x。
8. **Predicate Pushdown**：写 SQL 时把过滤下推到子查询里，别等到外层才 `WHERE`。
9. **避免 COUNT(DISTINCT)**：用 `approx_count_distinct`（HyperLogLog，误差 ~2%）或者 `sum(if(rn=1,1,0)) over`。
10. **Tez / LLAP 而非 MapReduce**：升 Hive 2.x+ 默认 Tez；3.x 开 LLAP（cache + 协处理）。

**调优套路**：先用 `EXPLAIN` 看 plan，找到"全表扫"和"reduce 倾斜"两个最大瓶颈，然后对症下药。**不要从 JVM 参数开始调**——SQL 层能解决 80% 的慢。

---

## 进一步阅读

- `src/hive_demo.sql` — 全章 demo
- `tests/test_hive.py` — 5 个测试
- Apache Hive wiki：https://cwiki.apache.org/confluence/display/Hive
- 《Hive 编程指南》—— Edward Capriolo
- 《数据密集型应用系统设计》—— Martin Kleppmann（DDIA）第 10-12 章