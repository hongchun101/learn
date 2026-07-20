# 第12章 实时数仓

> 关键词：Lambda、Kappa、湖仓一体、Flink、Iceberg、Hudi、Paimon、实时 DWD/DWS/ADS、Event Time、Watermark、Exactly-Once、Late Data

如果说离线数仓解决的是"昨天发生了什么"，那么实时数仓解决的就是"现在正在发生什么"。它面向监控大屏、实时推荐、风控反欺诈、ABTest 实时效果归因等延迟敏感场景，要求端到端秒级可见。离线数仓以 Hive/Spark 为代表，批量吞吐大、成本低；实时数仓以 Flink+Kafka 为代表，状态强、延迟低。本章用一套 DuckDB 上可复现的 SQL 流水线串起四个层（ODS→DWD→DWS→ADS），并讨论两种主流架构（Lambda 与 Kappa）、三种湖表格式（Iceberg/Hudi/Paimon），以及常见的口径与坑位。

---

## ch01 Lambda 架构

**Lambda 架构**是 Nathan Marz 在 2011 年前后提出的一套"批流两条腿走路"的数仓形态：把所有数据同时写进批层（Batch Layer）和速度层（Speed Layer），由服务层（Serving Layer）合并两者结果。

- **批层（Batch Layer）**：用 Hive/Spark 全量重算 T+1 的数据，结果写入可查询的列式表（Parquet/ORC）。它的优势是结果权威、可重放；劣势是延迟高、资源重。
- **速度层（Speed Layer）**：用 Flink/Spark Streaming 增量计算最近几分钟到几小时的数据，结果写入实时 KV（Redis、HBase、Phoenix）。
- **服务层（Serving Layer）**：查询时合并批视图 + 实时视图，对外提供最终结果。

Lambda 的优点是容错性强（任何故障都可以靠批层重算修复）、延迟可控；缺点是同一套业务逻辑要在两套引擎上实现并保证口径一致，运维成本翻倍。我们 12 章的离线层与本章的实时层正是这一架构的微缩版。

但 Lambda 也带来几个经典痛点：①批流两套代码容易口径漂移；②数据要写两次（Kafka→HDFS→Hive，同时 Kafka→Flink→Redis），存储成本高；③服务层合并逻辑复杂，跨层 join 一旦出错很难排查。这些痛点正是 Kappa 架构想要消灭的东西。

---

## ch02 Kappa 架构

**Kappa 架构**由 LinkedIn 的 Jay Kreps 在 2014 年提出，核心主张是"用流计算统一一切"。把批视图也当作流视图的一种特例——一个运行到世界末日的历史流——批层不再单独存在。

- 所有数据都进 Kafka（或兼容的 Pulsar、AutoMQ、Iceberg Stream），按分区顺序保留。
- Flink 从头消费一次就是离线，从当前 offset 消费就是实时，没有两套代码。
- 当业务口径变更或上游出错时，重置 consumer group offset，从某个历史 offset 重放全量——这叫 **replay**。

Kappa 看起来很美，但落地有几个前提：①Kafka（或类 Kafka 的 Append-Only 日志）必须能长时间（7~30 天甚至更久）保留数据；②Flink 状态必须足够大、可重放；③作业必须支持从 savepoint 恢复且能重算任意时间窗。这对底层存储和 Flink 作业的快照机制提出了非常高的要求。

实际上 2023 年以后业界主流已变成 **Lambda + Kappa 的混合形态**：用湖仓（Lakehouse）取代 Hive，批流都用 Flink，物理上一份 Iceberg/Hudi/Paimon 表，逻辑上有 batch 视图与 stream 视图之分。本章最后一节"流批一体"会展开讨论。

---

## ch03 湖仓一体（Lakehouse）

**湖仓一体**的目标是用一份存储同时支持 BI 报表、SQL 分析、机器学习、实时查询四种负载，对象存储 + 开放表格式是它的两大支柱。

**Iceberg** 由 Netflix 开源，设计哲学是"快照隔离 + 隐藏分区"。每次 commit 是一份 manifest list，可以回滚到任意快照；对 Hive/Spark/Flink/Trino 友好，schema 演进自然；缺点是写放大相对高，flink-iceberg 在 1.14 之后才逐步稳定。

**Hudi** 由 Uber 开源，最早是为了解决 HDFS 上的增量更新。Copy-on-Write（COW）适合读多写少，Merge-on-Read（MOW）适合写多读多；内置索引（bloom、simple、bucket、record level）让 upsert 很快；与 Spark/Flink 集成最深，但和 Trino/Presto 的兼容性历史上一直有点别扭。

**Paimon**（原 Flink Table Store）是阿里在 2023 年捐给 Apache 的新生代湖表格式，从一开始就为流批一体设计。它把主键表与 Append 表分开，把 LSM-Tree 的思路搬到了湖上，Changelog Producer 与 Flink 双向流读结合得非常紧；在国内中大型互联网公司里，Paimon 正在快速替代 Hudi 的位置。

我们在 src/realtime_pipeline.sql 里没有真正写 Iceberg/Hudi/Paimon 的 DDL（因为 DuckDB 不直接支持），但分层模型与它们一一对应：ods 是 Append 表，dwd 是带主键的 Upsert 表，dws 是聚合结果表，ads 是面向 BI 的物化视图。把脚本里 `CREATE TABLE` 换成 `CREATE TABLE ... USING paimon`（或 iceberg/hudi）就能在 Flink SQL 客户端直接运行。

---

## ch04 实时 DWD（Detail）

**DWD（Data Warehouse Detail）**承接 ODS，做三件事：清洗、丰富、主键去重。在实时场景下，DWD 通常由一张 Flink 作业维护，向下输出 changelog 流或 upsert 到湖表主键表。

清洗：去掉脏数据（空字段、超长字段、未来时间戳）、统一字段类型（字符串时间戳 → TIMESTAMP）、规范化枚举值（event_type 全转成小写）。在我们的 SQL 里这一段对应：

```sql
CASE event_type WHEN 'pv' THEN 1 ELSE 0 END AS is_pv,
DATE_TRUNC('hour', event_ts) AS event_hour
```

丰富：把维表（如商品维表、用户维表）join 到事实流上，得到用户等级、商品类目等属性。维表 join 在 Flink SQL 里通常用 `FOR SYSTEM_TIME AS OF` 做 Temporal Join，要求维表有 changelog（如 Paimon/Hudi 主键表）。

去重：在 Kafka 中同一事件可能被重投（at-least-once），DWD 必须做**精确一次（exactly-once）**。方法有两种：①按主键做 upsert（写入 Hudi/Paimon 主键表）；②窗口内去重（Flink SQL 的 `DEDUPLICATE` 或 ROW_NUMBER）。我们的脚本用了 ROW_NUMBER：

```sql
ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY event_ts ASC) AS rn
WHERE rn = 1
```

这一段是 exactly-once 正确性的核心；测试 `test_exactly_once_under_replay` 验证了把同一份原始数据写三遍（模拟 Kafka 重平衡重放）后，DWD 仍然只有一份。

---

## ch05 实时 DWS（Summary）

**DWS（Data Warehouse Summary）**是聚合层，把 DWD 的明细按业务口径做轻度汇总，常以"1 分钟 / 5 分钟 / 1 小时 / 1 天"为窗口。在实时场景下，窗口由 Flink 的 Tumble / Slide / Session 决定，并由 Watermark 推动触发。

我们在 SQL 里用 `GROUP BY user_id, event_date` 实现 1 天滚动窗口，得到 `dws.user_event_1d`：

```sql
SUM(is_pv)   AS pv_cnt,
SUM(is_cart) AS cart_cnt,
SUM(is_pay)  AS pay_cnt,
MIN(event_ts) AS first_event_ts,
MAX(event_ts) AS last_event_ts,
DATE_DIFF('second', MIN(event_ts), MAX(event_ts)) AS active_seconds
```

实时 DWS 与离线 DWS 有三点不同：①实时 DWS 是可更新的，迟到数据到来时 Flink 会撤回 + 重发，落到湖表主键表里就是 update；②实时 DWS 通常带 TTL（state TTL），否则作业跑久了状态会爆炸；③实时 DWS 需要有"版本号"或"事件时间"字段，否则下游无法区分新旧值。

窗口大小是常见踩点：窗口太小，结果抖动太大（DAU 忽上忽下）；窗口太大，监控大屏失去意义。经验值是面向运营的指标 1 分钟，面向用户的指标 5~10 分钟，跨天/跨月的指标离线算。

---

## ch06 实时 ADS（Application / Service）

**ADS（Application Data Service）**是面向应用的结果层，常见形态是物化视图、API、宽表、监控大屏数据源。ADS 几乎没有自己的加工逻辑，主要是把 DWS 的结果拼成应用想要的样子。

我们的 `ads.realtime_dau` 是最经典的 ADS 表之一：

```sql
SELECT
    event_date                            AS dt,
    COUNT(DISTINCT user_id)               AS dau,
    COUNT(DISTINCT CASE WHEN is_pv=1 THEN user_id END)   AS pv_uv,
    COUNT(DISTINCT CASE WHEN is_pay=1 THEN user_id END)  AS pay_uv,
    SUM(event_cnt)                        AS total_events
FROM dws.user_event_1d
GROUP BY event_date
```

它有几个细节值得讨论：①`COUNT(DISTINCT ...)` 是 Flink 里的硬骨头，老版本 Flink 只能做近似（HyperLogLog），1.17 之后才逐步支持精确去重；②`SUM(event_cnt)` 把多条同 user 同 day 的记录加和，得到"事件量"，这是衡量流量健康度的常用指标；③ADS 通常面向读优化，会落到 OLAP（Doris/StarRocks/ClickHouse）里，而不是 Flink 状态里。

---

## ch07 流批一体

**流批一体**是 2022 年以后业界真正的目标：同一份 SQL、同一个引擎、同一份存储，既能跑实时也能跑离线。三个支柱：

- **存储**：Iceberg/Hudi/Paimon 这类湖表格式，原生支持 append + upsert + delete，Flink 流写、Spark 批读、Trino 即席查全都能用。
- **引擎**：Flink 是目前唯一在"流"上做到了和 Spark 在"批"上同等 SQL 覆盖度的引擎，1.16 之后基本可以做到 `SET 'execution.runtime-mode' = 'batch'` 切流批。
- **口径**：流批 SQL 完全对齐，Flink 跑一遍是流结果，批模式再跑一遍是离线结果，两者只在延迟和成本上有差别。

但流批一体不是免费的午餐。流模式要求 state 可重放（依赖 checkpoint + savepoint），批模式要求中间结果可跳过（依赖 partition pruning + 谓词下推）。两者都要兼顾时往往要在存储层做权衡。常见的妥协方案是：写用 Flink 增量写湖表，读用 Spark/Trino 走湖表 snapshot，两者共享 schema 但走不同引擎——这其实已经是今天国内绝大多数大厂的现状。

---

## ch08 案例与坑

最后用一个电商场景串起本章所有概念。用户点击流经 Kafka 进 Flink：①Flink 1 分钟 Tumble 窗口做 `ods.user_events` 落湖（Paimon append 表）；②DWD 作业以 `event_id` 为主键 upsert 到 `dwd.user_events`，自然去重；③DWS 作业按 `user_id, event_date` 聚合，落 `dws.user_event_1d`；④ADS 作业从 DWS 取数，物化到 Doris 大屏表。

**坑一：Event Time vs Processing Time**。下游必须按事件时间开窗，否则一条迟到的支付事件会被算到"今天"的 DAU，造成指标虚高。`test_ads_realtime_dau_full_year` 验证了我们用的是 event_date。

**坑二：Watermark 与迟到数据**。Watermark 决定窗口什么时候关；关得太早会丢数据，关得太晚会一直不出结果。Flink 默认 `forBoundedOutOfOrderness(Duration.ofMinutes(2))`，业务要根据自己的最大迟到量调整。我们脚本里的 `late_data_demo` 模拟了 7 天迟到，验证 attribution 仍然是事件时间。

**坑三：状态膨胀**。长跑的大窗口作业如果不做 TTL，Flink RocksDB state 会无限增长，直到 OOM。建议 ①按用户/设备等高基数维度做局部聚合；②状态 TTL 设为窗口长度的 2~3 倍；③checkpoint 拆小、HDFS 后端换本地 SSD。

**坑四：口径不一致**。批流两套逻辑里 `is_pay` 一个算 1 一个算 0，下游 AB 报表就对不上。解决办法是把判断逻辑抽成 SQL 视图，让 Flink 和 Spark 引用同一份 SQL。

**坑五：Kafka 保留期 vs 重放成本**。Kappa 架构假设能从头重放，但 Kafka 默认保留 7 天，跨月任务要重算就要把数据同步到对象存储或者开启 Kafka 长期保留（Tiered Storage），不要等到重放时才想起来。

**坑六：维表 join 维度爆炸**。Temporal Join 维表 changelog 时，如果维表本身有几亿行，Flink 状态会被打爆。常见做法是把维表广播（Broadcast Join），适合小维表；或者用 Paimon Lookup 引擎，把 join 下推到存储层。

**坑七：去重到底在哪一层做**。ODS 层不做去重（保留原始）；DWD 层做主键去重；DWS 层按业务键去重；ADS 层一般不再去重。每一层的职责单一，bug 才能定位。本章脚本严格遵守了这一分层：ODS→DWD 的去重用 ROW_NUMBER，DWS 用 GROUP BY 天然去重，ADS 不去重只读。

至此 12 章的实时数仓全貌已经讲完。下一章我们会把 ODS 数据搬到数据湖（Iceberg/Hudi/Paimon），讨论分层存储与冷热分层——届时回头看本章的 SQL，你会发现它就是 Paimon 表里的几个 DDL。