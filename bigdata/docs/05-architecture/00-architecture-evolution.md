# 大数据架构演化:从传统数仓到 Lakehouse

## 一、传统数仓时代(1990s—2010s)

以 Teradata、Oracle Exadata、IBM Netezza 为代表的企业级 MPP 数据库占据主导。其核心假设是"结构化优先、一份全量、批处理周期长"。

- **架构特征**:单点昂贵硬件 + 专属 ETL 工具(Informatica、DataStage) + 面向报表的星型/雪花模型。
- **典型痛点**:扩展成本高(TB 级已属天花板)、Schema 强耦合、ETL 跑批以小时计、不擅长非结构化数据。
- **代表方法论**:Inmon 的"自顶向下 CIF"、Kimball 的"维度建模总线"。两者之争本质上是在讨论"数据集市该如何汇聚"。

这一阶段的 BI 报表场景基本被满足,但数据量从 GB 进入 TB 后,瓶颈迅速从"算"转向"存"。

## 二、数据平台时代(2010—2017)

Hadoop 生态(HDFS+YARN+Hive+Spark)将存储与计算解耦,把"无限横向扩展"变成现实。

- **架构特征**:廉价 X86 服务器堆叠存算分离、面向批量 ETL 的 ODS/DWD/DWS/ADS 分层、调度系统(Oozie/Azkaban)主导。
- **代表项目**:Facebook 在 Hive 上的 PB 级实践、LinkedIn 从 Hive 转向 Spark 的迁移、Cloudera/HDP 商业发行版。
- **典型痛点**:
  1. Hive 数仓只能 T+1,实时场景被 Storm/Spark Streaming 临时补位;
  2. 资源争抢严重,YARN 队列治理代价高;
  3. 数据孤岛——业务库、Hive、日志、缓存各自为政,跨域口径难以对齐。

这一阶段的问题不是"算不动",而是"找不到、读不快、信任差"。

## 三、数据中台时代(2017—2021)

阿里提出"OneData+OneID+OneService"三大体系,以"中台"思路把分散能力重新聚合。

- **核心目标**:指标体系统一、标签资产共享、数据服务化输出。
- **典型组件**:阿里云 MaxCompute/Dataworks、字节 ByteHouse、网易 网易有数、美团酒旅数据中台。
- **价值与代价**:
  - 价值:烟囱收敛、口径收敛、组织协同(数据 PD 角色);
  - 代价:中台被过度神化,变成"什么都装、什么都难管"的大锅,且与业务绑定,跨 BU 复用困难。

## 四、Data Mesh 时代(2019—至今)

受 ThoughtWorks 提出的 Data Mesh 启发,业界开始反思"集中式数仓是否是最优解"。

- **四大原则**:域驱动所有权、数据即产品、自助式数据平台、联邦化治理。
- **本质**:把"中央数仓团队"降级为"平台与治理团队",把数据所有权归还业务域,数据通过标准化接口(契约、Schema Registry、SLA)被消费。
- **落地形态**:每个 BU 维护自己的 Domain Lake,通过统一的 Catalog(Gravitino、Unity Catalog)和数据契约联动。
- **挑战**:跨域 join、跨域口径、全局指标统一仍需中台层的"虚拟化"能力。

## 五、Lakehouse 时代(2020—至今)

Delta Lake/Iceberg/Hudi 三家开源格式的成熟,加上云原生对象存储(S3/OSS/ABFS),把"数仓的 ACID 与性能、湖的低成本"缝合起来。

- **核心能力**:
  - **ACID 事务**:Iceberg 的 Snapshot、Hidden Partition、Time Travel,让批流在数据层统一;
  - **Schema Evolution**:加列不重写,字段类型可演化;
  - **多引擎**:同一份 Iceberg 表,Trino/Spark/Flink/StarRocks 共读;
  - **开放格式**:不再被任何单一商业引擎绑定。
- **代表架构**:Databricks Lakehouse、StarRocks+Doris+Iceberg、阿里云 MaxCompute+Iceberg、Paimon(原 Flink Table Store)。
- **未来方向**:
  - 与 AI/ML 深度融合(Feature Store、Iceberg REST Catalog 作为训练数据源);
  - 向量检索 + 文本检索的混合检索(湖仓之上再叠索引层);
  - 数据契约 + Metric/语义层(MetricFlow、Cube)统一上卷逻辑。

## 六、演化逻辑总结

| 阶段 | 核心矛盾 | 解决方案 | 新引入问题 |
|-----|---------|---------|------------|
| 传统数仓 | 算不动/存不下 | 专用 MPP | 扩展贵 |
| 数据平台 | 用不上/找不到 | 存算分离+Hive | 实时差、烟囱多 |
| 数据中台 | 口径乱/不共享 | 集中建仓+OneData | 中台臃肿 |
| Data Mesh | 中央化慢 | 域自治+联邦 | 跨域难 |
| Lakehouse | 流批分裂/锁死引擎 | 开放表格式 | 治理复杂 |

> **结论**:架构演化不是"后者取代前者",而是新场景对旧架构提出新约束,促使分层再分层。新一代工程师既要懂 SQL 优化,也要懂 Catalog、文件格式、调度血缘——这些是架构能力的基本盘。