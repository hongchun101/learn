# DataOps:原则与工程实践

## 一、DataOps 的定位

DataOps 借鉴 DevOps、敏捷与精益思想,把数据团队从"几个 SQL boy / girl"变成"持续交付的数据工厂"。其目标是用工程化、自动化、文化的方式,缩短从数据接入到价值释放的周期。

**DataOps ≠ Data Engineering**,DataOps 包含后者,还包含测试、版本、合规、协作、可观测、安全等工程实践。

## 二、DataOps 五大原则

| 原则 | 实践映射 |
|-----|----------|
| **1. 端到端可观测** | 从数据接入到消费的全链路追踪(OpenLineage/Marquez) |
| **2. 自动化一切** | CDC 自动接入 + Schema 自动推导 + CI/CD 全链 |
| **3. 持续测试** | Schema 校验 + DQ 规则 + 关键指标 smoke test |
| **4. 跨团队协作** | Producer / Steward / Consumer 三方协作 + 契约 |
| **5. 安全嵌入** | Field Masking + 行级过滤 + 审计 + 合规报表 |

## 三、CDC 接入流水线

CDC(Change Data Capture)是 DataOps 的入口,主流选型:

- **Debezium**(Java,IBM RedHat 维护):MySQL/PostgreSQL/MongoDB,使用 Binlog/Redo/WAL;
- **Flink CDC**(阿里开源):深度整合 Flink,使用 Debezium 引擎但提供更友好的 SQL DSL;
- **Maxwell / Canal**:早期 MySQL CDC,只追数据不追 Schema;
- **PolarCDC / OceanBase CDC**:特定数据库自带的 CDC。

**典型架构**:
```
MySQL / PG / Mongo
   │ (Binlog / WAL)
   ▼
Kafka / Pulsar / RocketMQ (Topic)
   │
   ▼
Flink CDC / Debezium
   │ (Schema Registry)
   ▼
Iceberg / Paimon / Hudi (主仓)
   │
   ▼
DWD / DWS / ADS
```

**Schema 演化问题**:
- 上游加列 → 下游如何感知?
- Schema Registry(Confluent/Apicurio)维护 schema 历史;
- 兼容策略:`backward`、`forward`、`full` 三种兼容性矩阵;
- 实际生产中,**推荐两者用 Avro/Protobuf 携带 schema**,反序列化时锁定版本。

## 四、CI/CD 数据管线

### 1. 三个核心层面

| 层级 | 工具 | 实践 |
|-----|------|------|
| **SQL CI** | dbt + SQLFluff + Datafold | 语法、引用、字段类型检查 |
| **Pipeline CI** | Apache Airflow DAG + GitHub Actions / GitLab CI | DAG 编译、连通性测试 |
| **Data CD** | Argo CD / Flagger / StreamX | 滚动升级、灰度发布 |

### 2. 关键动作

- **PR 触发数据 DAG 单测**:基于小数据集验证 SQL 编译与逻辑;
- **冒烟测试**(Smoke Test):在 staging 环境跑一遍真实 SQL,再上 prod;
- **回滚预案**:`flink savepoint`、`spark history`、Iceberg 的 `rollback_to_snapshot`;
- **审批流**:`domain_owner + platform_lead + dba`三重审核,DAG 才能 mainline。

### 3. 蓝绿与灰度

- **蓝绿**:`prod` / `preprod` 两套 Iceberg namespace,DAG 路由到不同 namespace 验证;
- **灰度**:`10% → 30% → 50% → 100%` 的渐进发布(借助 Kafka 多消费者组 / Flink sink 路由)。

## 五、数据版本与可追溯

| 维度 | 工具 | 实现 |
|-----|------|------|
| **代码版本** | Git / DVC / Pachyderm | DAG 代码版本化,Tag 与生产绑定 |
| **数据版本** | Iceberg Snapshot / Paimon Snapshot | 表的每个 commit 都是 immutable 视图 |
| **模型版本** | MLflow / Feast / Delta Model | 模型权重 + 评估指标 |
| **特征版本** | Feast / Hopsworks | 同一特征不同时间窗 |
| **任务版本** | Airflow + 版本化 DAG ID | DAG 的每一次变更都有 trace |

**双向追溯**:
- **代码 → 数据**:从某一次 commit 顺推到对应 Iceberg snapshot;
- **数据 → 代码**:从某个 partition 反推到哪个 DAG 版本产出。

## 六、可观测与运行时监控

### 1. 三大支柱

1. **Metrics(指标)**:写入吞吐、读取延迟、错误率、SLA 完成率;
2. **Logs(日志)**:ETL 链路每一跳结构化日志;
3. **Trace(追踪)**:OpenTelemetry + OpenLineage 串联"上游→ETL→下游"。

### 2. 关键监控项

- **数据延迟**:`event_time - proc_time` P99,P95 ≤ 阈值;
- **数据漂移**:某列 `count(distinct)` 与上周同期偏差 > 5% 视为漂移;
- **任务失败**:DAG 状态、SLA miss、回刷堆积;
- **资源使用**:CPU/Memory/Network/Checkpoint size 等。

## 七、协作与治理

### 1. 角色

| 角色 | 职责 |
|-----|------|
| **Producer** | 业务系统开发,负责埋点与表写入 |
| **Data Steward** | 域数据管家,负责该域的元数据/质量 |
| **Domain Owner** | 业务方负责人,对口径负责 |
| **Platform Engineer** | 平台侧,提供工具和 SLA |
| **Data Engineer** | ETL 实现,负责 Pipeline 落地 |
| **Analyst / Consumer** | 数据消费方 |

### 2. 协作机制

- **RACI**:每个任务明确 Responsible / Accountable / Consulted / Informed;
- **每周治理例会**:Owner 汇报本周 DQ 分数、变更、事故;
- **灾难演练(Chaos Test)**:故意注入误写入、延迟、缺失,验证告警和回滚;
- **数据目录评审**:新表入库需声明等级、Owner、SLA。

## 八、安全与合规

### 1. 数据安全基础

- **静态加密**:对象存储默认 SSE-KMS;
- **传输加密**:Kafka SSL/TLS + SASL;
- **字段脱敏**:Hash/Mask/Tokenize 三种,常用 Format-Preserving Mask;
- **行级权限**:ABAC 策略(地区、表等级 + 用户角色);
- **审计日志**:谁、在什么时候、访问什么表 — 强制留痕。

### 2. 合规设计

- **GDPR/CCPA**:遗忘权可执行 — 立即 delete 慢表 + 删除 Hive 外文件;
- **金融合规**:字段级 MASK + 加密广播,审计链不间断;
- **跨境**:Region 隔离、出口数据审批流。

## 九、面试高频问题

- "DataOps 与 DevOps 的差异?" — DevOps 关注服务,DataOps 还要管"数据"的 schema/SLA/质量;
- "CDC 与 Binlog 区别?" — Binlog 是 MySQL 内置,CDC 是把 Binlog/Redo 抽到外部流;
- "Schema Registry 必要性?" — Producer/Consumer 跨版本兼容,Producer 变更前锁路径;
- "数据治理到 DataOps 的边界在哪?" — 治理管"规则与归属",DataOps 管"执行与保障";
- "为什么用 Iceberg 而不是 Hive 做版本管理?" — Iceberg 内置 snapshot,回滚/查询分钟级;Hive 分区变更不可逆。

> **结论**:DataOps 的核心是"数据也是产品"——谁在生产、谁在消费、SLA 在哪里、变更怎么走、失败怎么退,五件事在工程上闭环后,数据团队才能从"救火"转向"赋能"。