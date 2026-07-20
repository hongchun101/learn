# Module 16 — 元数据与数据安全 (Metadata & Security)

> 数仓不是"把数据搬过来"就结束了。当表的数量从几十张涨到几千张、字段从几百个涨到几万个、用户从分析师扩展到 BI、算法、运营、合规、客服——**谁能看到什么、谁的血缘断了、谁是字段的负责人**——会立刻变成系统性问题。本章用 DuckDB 模拟一个企业级元数据 + 数据安全栈,把元数据目录、血缘、脱敏、行级权限、审计这五件最容易遗漏的事情做扎实。

## ch01 元数据管理 (Metadata Management)

**元数据**是"关于数据的数据":表名、字段、类型、所属层、负责人、描述、标签。生产中元数据分三类:

| 类型       | 例子                          | 谁负责维护     |
|------------|-------------------------------|----------------|
| **技术元数据** | schema、partition、stats、offset | 平台 / ETL    |
| **业务元数据** | 字段口径、负责人、SLA、tags   | 数据产品经理   |
| **运维元数据** | job run、lineage、cost        | SRE / 调度     |

本模块的 `MetadataCatalog` 把这三类压成一个 6 张表的 DuckDB schema:

- `metadata.tables` — 表本身(layer, name, owner, description)
- `metadata.columns` — 每个字段(data_type, nullable, tags)
- `metadata.lineage` — 列级血缘边(upstream → downstream + transform)
- `metadata.masking_policies` — 字段脱敏策略
- `metadata.row_policies` — 行级权限谓词
- `metadata.audit_log` — 不可变审计日志

设计取舍:刻意**不分多个 schema**——DataHub / Atlas / Glue Catalog 都有几十张表,但读起来心智负担重。教学项目里 6 张表足够覆盖核心概念,真要做生产规模,Atlas 那一套 JanusGraph 的反范式才有意义。

## ch02 DataHub (LinkedIn 开源)

[DataHub](https://datahubproject.io/) 是 LinkedIn 2019 年开源的元数据平台,2020 年从 WhereHows 演化而来。它采用 **push-based ingestion**(摄取器主动把元数据推到 DataHub)而不是定时爬取:

- **Metadata Model**:用 PDL( Pegasus Data Language)定义 entities + relationships,核心实体是 `Dataset`(对应一张表)、`DataFlow`(一个 ETL job)、`Dashboard`、`Chart`。
- **Ingestion Framework**:Python SDK,内置 Kafka、Hive、Superset、Looker、BigQuery、Snowflake、Glue 等几十个 connector。每个 connector 输出 `MetadataChangeEvent`(MCE)→ Kafka → MAE Consumer → MySQL/ES/Kafka(分别存图、查索引、传变更)。
- **搜索**:Elasticsearch 倒排索引,字段描述 + tag 全文检索,毫秒级返回。
- **数据血缘**:列级血缘通过 SQL parser + 静态分析产出;支持 OpenLineage 协议接收 Spark/Flink 的运行时血缘。
- **ACL/Ownership**:dataset 绑定 owner group,可以接 LDAP / OIDC;字段的 Glossary Term 也走 ACL。

DataHub 强在 UI 和生态(几乎所有主流数仓/BI 都有 connector);弱在数据规模上来后 ES 索引成本陡增。

## ch03 Apache Atlas (Hadoop 生态)

[Apache Atlas](https://atlas.apache.org/) 是 Hadoop 社区(Hortonworks 主导)2015 年开源的元数据 + 治理平台,强项是和 **HDFS / Hive / Kafka / HBase / Spark / Storm** 这些 Hadoop 组件原生 hook:

- **存储**:默认 JanusGraph(底层 Cassandra + ES),实体和关系都是图节点,**多跳血缘查询**极快。
- **Hook**:Hive 的 metastore listener、Kafka 的 topic registration、Spark 的 event listener——只要组件发事件,Atlas 自动采集。
- **分类 (Classification)**:PII、敏感、信用卡号等可以定义为 **Propagation**(自动沿血缘传染)。一张 `ods.users.email` 打上 PII tag,下游 `ads.user_rfm.email` 自动也是 PII——这就是 **tag-based 治理**。
- **REST API + DSL**:Atlas 自己的 AtlasQL,适合复杂的图查询。

Atlas 强在血缘的"自动传染"和 Hadoop 深度集成;弱在 UI 老旧、部署复杂(HBase + Solr + Kafka + Cassandra 全套)。

## ch04 AWS Glue Catalog (云厂商方案)

[Glue Data Catalog](https://docs.aws.amazon.com/glue/) 是 AWS 的托管 catalog,所有 Athena / Redshift Spectrum / EMR / Glue ETL / Lake Formation 都直接读它:

- **存储**:内部是 Hive Metastore 的 schema,放在 RDS 后面,跨账户可共享。
- **Schema Registry**:Kafka topic 的 Avro / Protobuf / JSON Schema 集中存放,Glue Schema Registry 直接提供 schema evolution 兼容性检查。
- **Lake Formation**:真正做"字段级权限"的产品——按列打 tag (LF-Tag),然后用 GRANT 授权给角色。**这是云上最成熟的数据脱敏 + 行级权限组合**。
- **Crawler**:定时爬 S3 数据推断 schema,适合无元数据的数据湖起步。

Glue 的局限:深度绑定 AWS,跨云要重新做一套。但它的 LF-Tag 设计很值得学——本模块的 `MaskPolicy` 就是 LF-Tag 的极简版。

## ch05 数据血缘 (Lineage)

血缘分**表级**和**列级**两种粒度:

- **表级血缘**:Spark / Hive 的 `InputFormat` / `OutputFormat` 自动记录,粒度粗,只能告诉你 `dwd.orders` 来自 `ods.orders + ods.order_items`。
- **列级血缘**:真正能定位"GMV 涨了是哪个字段变"的唯一办法。生产里有两种获取方式:
  - **静态分析**:解析 SQL 抽象语法树,从 `SELECT` 列表反推每个输出列依赖哪些输入列。Glue Catalog、Apache Atlas 都是这个路线。
  - **运行时打点**:Spark 的 `QueryExecutionListener`、Flink 的 `LineageWriter`,记录每个算子的列映射,准确但侵入性强。OpenLineage 协议(Marquez)是这个方向的事实标准。

本模块的 `MetadataCatalog.downstream_of(column)` / `upstream_of(column)` 用 BFS 走 `metadata.lineage` 边表,这是 **column-level blast radius** 的最小可工作实现——一个字段出问题,你能秒列出"哪些下游报表 / 模型 / dashboard 受影响"。

教学项目刻意简化了 transform 字段(只存 free-text 描述),不存具体表达式。生产里 `transform` 应是结构化的:`[{"from":"ods.orders.total","op":"SUM","where":"status='completed'"}]`。

## ch06 数据脱敏 (Column Masking)

脱敏是**字段级**安全控制:同一张表里,`email` 字段对分析员是 hash、对运营是部分掩码、对管理员是明文。本模块的 `MaskPolicy` 支持 4 种策略:

| policy        | 例子                                | 用途                     |
|---------------|-------------------------------------|--------------------------|
| `none`        | `email`                            | 内部公开字段              |
| `redact`      | `NULL`                             | 极端敏感(密码、CVV)       |
| `hash`        | `md5(email)`                       | 跨表 join 仍能用,明文没了  |
| `partial_mask`| `13**********`                     | 客服回访能看到区号          |

实现细节:

- 脱敏通过**生成 SELECT 投影表达式**实现,而非改写底层表。这意味着审计链路清晰——查 `metadata.masking_policies` 就能还原"看到这条数据经过了哪些变换"。
- 缺省策略:任何 `tags` 命中 PII 集合(`pii`/`email`/`phone`/`id_card`)但**没有显式 policy** 的列,自动套 `partial_mask keep=2`。这是 fail-safe 默认值——宁可多掩,不能漏掩。
- DuckDB 的 `md5()` 返回 32-char hex 字符串,可以直接做 group-by / join,这是 hash 策略选 DuckDB 而非 `sha256` 的原因。

生产里脱敏通常和 **动态数据脱敏 (DDM)** / **列级 GRANT** 配合——Snowflake 的 `CREATE MASKING POLICY`、BigQuery 的 `column-level policy`、Lake Formation 的 LF-Tag,核心思想都是本模块的简化版。

## ch07 行级权限 (Row-Level Security)

行级权限管的是"**谁能看哪几行**"——同样是 `dwd.orders`,分析师看不到 `refunded` 行,客服只能看最近 30 天的订单。本模块用一张 `row_policies(role, table_fq, predicate)` 表存谓词,然后 `apply_row_filter(layer, table, role)` 把它拼到 `WHERE` 上:

```sql
SELECT * FROM dwd.orders WHERE status NOT IN ('refunded','cancelled')  -- analyst
SELECT * FROM dwd.orders WHERE dt >= CURRENT_DATE - INTERVAL '30 days' -- support
SELECT * FROM dwd.orders                                              -- admin (no policy)
```

教学项目里谓词是字符串拼接——生产里应该:

1. **谓词编译时绑定参数**(role → current_user 映射),杜绝注入。
2. **谓词最小化**:把多条 policy AND 起来时要化简(部分引擎会按角色短路)。
3. **谓词性能**:加 hint 让 CBO 把它推到 join 之前,否则大表全扫。

本模块的角色是字符串(`analyst` / `support` / `admin`),故意不接 LDAP/SSO——身份认证是边界问题,本模块只关心"拿到 role 之后怎么过滤"。

测试覆盖:admin 全见、analyst 看到 4/6、support 因为种子日期远早于今天全被过滤、自定义 role 无 policy 等于不限。这套断言也适合做金标:接 LDAP 后只要换 role 解析逻辑,断言不变。

## ch08 审计 (Audit)

**审计是合规和事故复盘的底线**。GDPR / 等保 / SOC2 都强制要求:

- 谁在什么时间访问了哪些数据
- 谁修改了脱敏策略
- 谁授权 / 撤销了权限

本模块的 `metadata.audit_log` 表字段:`ts, actor, action, target, detail`,append-only——没有 UPDATE / DELETE 接口。生产里通常用 Kafka + 不可变日志(CloudWatch Logs / S3 Object Lock / WORM 存储)做长期归档。

关键实践:

1. **审计读取和元数据写入走不同账号**——元数据被攻破时审计日志不能一起丢。
2. **采样 + 全量分层**:95% 业务访问只记 hash(user_id) + table_name + count,5% 详细访问记原始 SQL。
3. **敏感字段访问单独告警**:任意用户 24 小时内读取 `ods.users.email` 超过 N 次 → 自动告警。这是 UEBA(User & Entity Behavior Analytics)的基础。

教学项目里 `cat.audit(actor, action, target, detail)` 一行调用就够,生产里请把这条调用埋到所有 `apply_masks` / `apply_row_filter` 的执行路径上,**默认每次查询都记录**,而不是出事故后再补。

---

## 演示运行

```bash
# 单独运行 demo
D:\env\anaconda3\python.exe modules/16-metadata-security/src/metadata_demo.py

# 跑测试
D:\env\anaconda3\python.exe -m pytest modules/16-metadata-security/tests/ -v
```

期望输出:

```
tables registered : 5
columns registered: 27
lineage edges     : 16
PII columns       : 2
4 passed
```
