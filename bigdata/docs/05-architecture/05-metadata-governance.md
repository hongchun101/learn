# 元数据治理:HMS、Gravitino、StarRocks Catalog、DataHub、Unity Catalog

## 一、为什么元数据治理越来越重要

数据团队在 2020 年后普遍面临三类问题:

1. **找表难**:5 万张表的 Hive 仓库,没人能说清"GMV 在哪";
2. **信任缺失**:同一指标在不同 BI 报表里数字对不上;
3. **权限失控**:实习生账号能拖全量用户表,合规检查否决。

三者本质都指向"元数据没治理好"。这正是 HMS 局限暴露、Gravitino/Unity Catalog 出场的根本原因。

## 二、HMS 的局限性

Hive Metastore Service 长期作为元数据的事实标准,但随着湖仓生态演进,问题逐渐放大:

| 局限 | 现象 |
|-----|------|
| **强依赖 Hive 协议** | Iceberg/Hudi/Paimon 需要包装层才能入仓 |
| **元数据不是版本化的** | 表 schema 变更历史不可追溯 |
| **批量抖动** | 大集群高峰期 thrift 接口雪崩 |
| **不支持多租户** | 字段级权限、行级策略落地困难 |
| **不能联邦** | 跨 Hive / MySQL / ClickHouse 的全局视图没有 |

在大集群(>10k 张表)上,HMS 直接使用已经变得不稳定。

## 三、主流元数据治理平台对比

### 1. Gravitino(Apache,前身为 Apache Submarine/Ranger 的下一代)

- **定位**:**统一元数据湖**,支持表/视图/消息流/文件/AI 模型。
- **元模型**:
  - **Metalake**(湖)→ **Catalog**(目录)→ **Schema**(库)→ **Table/Topic/Index**(对象)→ **Tag/Property**(标签)。
- **核心能力**:
  - **多数据源联邦**:Hive、Iceberg、Paimon、MySQL、Kafka、Kubernetes、MLflow、HuggingFace;
  - **集中授权**(RBAC + ABAC) + 字段血缘;
  - **数据契约**(Data Contract):Producer 把字段类型/允许值暴露给 Consumer,自动校验;
  - **REST API** 标准接口,兼容 Iceberg REST Catalog。
- **生态适配**:Trino、Flink、Spark、Doris、StarRocks、Kyubi 均提供 connector,落地成熟度高。

### 2. StarRocks External Catalog

- **定位**:StarRocks 自身的"多源联邦查询目录"。
- **能力**:Hive、Iceberg、Hudi、Paimon、MySQL、ES、JDBC、Kafka 都可建 external catalog;支持 `SELECT * FROM iceberg.ecommerce.dwd_order`。
- **优势**:跨源查询 + 内置 CBO + 物化视图加速,**对实时数仓场景尤其友好**。
- **不足**:本质是查询侧联邦,做"治理平台"还差一截,通常配合 Gravitino/Unity 共同使用。

### 3. DataHub(LinkedIn 开源)

- **定位**:**元数据平台(元数据 Portal + 血缘 Graph)**。
- **架构**:
  - **Metadata Model**(Entity Registry + Aspects):每个实体挂多个 aspect(schema、owner、lineage、tag);
  - **Ingestion Framework**:Kafka / Snowflake / Looker / DAG / Kafka Connect 等都可通过 connector 接入;
  - **Graph**:基于 Neo4j 维护上下游血缘。
- **优势**:可视化 Portal 体验佳,血缘图谱强,搜索功能齐全。
- **不足**:不带统一访问控制、不带数据契约,治理"软"成分多。

### 4. Unity Catalog(Databricks 开源,后续逐渐标准化)

- **定位**:Databricks 数据治理的"四层模型"(Metastore → Catalog → Schema → Table)。
- **核心特性**:
  - **External Storage Credential**:把对象存储凭据托管,不再下传到个人;
  - **Table-Level ACL + Row/Column Level**(列脱敏、行过滤);
  - **与 Delta Lake 深度整合**,也支持 Iceberg via REST;
  - **线性化元数据 API**:Open API + REST,易对接。
- **优势**:商业产品级 SLA,合同驱动很全;
- **不足**:Databricks 平台耦合度仍高,迁移到开源栈 (Trino + Iceberg) 需自行补 OAuth 客户端。

### 5. 横向对比

| 能力 | HMS | Gravitino | StarRocks Catalog | DataHub | Unity Catalog |
|-----|-----|-----------|--------------------|---------|----------------|
| 元数据模型 | 三层 | 五层 | 二层 | Entity-Aspect | 四层 |
| 多源联邦 | 弱 | 强 | 强(查询) | 中 | 中 |
| 字段级血缘 | 弱 | 强(plugins) | 无 | 强 | 中 |
| 集中授权 | 中 | 强 | 强 | 中 | 强 |
| 数据契约 | 无 | 有 | 无 | 有 | 中 |
| 多租户 | 弱 | 强 | 中 | 中 | 强 |
| 生态成熟度 | 高 | 中(快速) | 高 | 高 | 商业绑定 |

## 四、字段级血缘的实现

字段级血缘是元数据治理的"皇冠",主流两种技术路线:

1. **SQL Parser 静态解析** — 通过 Flink/Spark 的 Plan 或 ANTLR 解析 SQL,把"输出字段来自输入字段"的关系提取为 DAG。
   - 工具:OpenLineage、Apache Atlas、Spline、sqlflow lineage;
   - 优势:覆盖率高,即使任务出错也能跑出来。
2. **运行时采集(运行时 Hook)** — 在计算引擎端(Trino/Flink)挂 hook,实时抓取 DAG。
   - 优势:数据真实;
   - 不足:任务没跑就没有血缘,对回溯极不友好。

**生产建议**:SQL Parser 静态采集作主,运行时 hook 作辅,二者合并去重。

## 五、DataHub 部署经验

国内大厂常以"DataHub + Gravitino"双栈形式落地:

- **DataHub**:负责可视化 Portal + 字段血缘展示 + Owner/Data Steward 角色维护;
- **Gravitino**:负责 Federation + Authorization + 数据契约 + Iceberg REST。

Pipeline 流程:
```
Flink / Spark / Hive Job
   │ (hook)
   ▼
OpenLineage / Marquez  / DataHub Ingest
   │
   ▼
Graph DB(Neo4j / Neptune)
   │
   ▼
DataHub Frontend(GQL + Search)
   ▼
用户自助消费(API + UI)
```

## 六、元数据治理落地的最小可行集合

1. **统一命名规范**(分层 + 业务过程 + 周期,见第一章);
2. **字段 Owner 强制挂载** —— 每张表必须有一个业务 Owner + 一个 Data Steward;
3. **重要表分等级**(L0—L3)** —— 不同等级对应不同的 SLA、保留期、合规策略;
4. **关键指标进 Data Contract** —— 与下游约定字段类型、允许值、更新频率,Producer 改动必须先通知;
5. **跨域 join 必须走 Federated Query**,不让数据物理出域。

## 七、面试问题精选

- "HMS 为什么在大集群上扛不住?" — 单体 service + 序列化抖动 + 缺少联邦;
- "DataHub 和 Gravitino 关系?" — 前者是 Portal,后者是 Federation + Auth 的核心;
- "Unity Catalog 优势在哪?" — 商业产品成熟、列级授权、Delta 集成;
- "字段血缘怎么落地?" — SQL Parser + 运行时 Hook,二者结合,展示给业务;
- "数据契约为什么重要?" — 锁定 schema、类型、值域,避免上游变动"悄悄"炸掉下游。

> **结论**:元数据治理已经不是"附赠品",而是数据平台的核心资产。一个 5 万张表的企业,治理投入能从"找表"问题里大幅节省人力。HMS 已不再是终点,Gravitino/Unity Catalog 才是 Lakehouse 时代的合理选择。