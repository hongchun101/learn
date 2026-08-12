# 实时数仓:HBase/Phoenix、Kudu、Iceberg+Flink、Paimon、StarRocks

## 一、实时数仓的本质要求

实时数仓(Real-time Data Warehouse)与传统 T+1 数仓最大的差异是把 **"端到端延迟"** 从小时级压到秒级甚至亚秒级,核心要求包括:

1. **写入吞吐**:百万级 RPS 持续写入不丢数据;
2. **查询延迟**:BI 看板秒级响应,运营定向查询 < 2s;
3. **可更新**:流上的迟到数据(乱序、回填)必须支持 upsert/delete;
4. **流批一致**:离线 T+1 报表与实时报表在数据层要不打架;
5. **存算可扩**:至少独立扩其中一项,避免再次遇到 HBase 那样的扩容瓶颈。

## 二、方案一:HBase + Phoenix / Doris(传统方案)

**架构形态**:Kafka → Flink → HBase(写宽表) + Phoenix(SQL/二级索引) + Redis(缓存)。

- **优点**:时延低(单跳查询 10ms 量级),HBase 的 rowkey 设计得当即查询极快;Phoenix 让 SQL 直接对接。
- **缺点**:
  1. HBase 自身是 KV 引擎,二级索引沉重,大宽表业务扛不住;
  2. 扩容依赖 Region Server 重平衡,百台规模后运维成本骤升;
  3. 与离线数仓割裂,口径必须靠人工对齐。
- **适用场景**:用户画像查询、订单状态查询、日志关键字检索。

## 三、方案二:Kudu(流批一体的早期尝试)

Kudu 是 Cloudera 在 2015 年开源的列式存储,主打"既能高速写入也能快速分析"。

- **架构形态**:Impala + Kudu,补全 HBase 不擅分析和 Parquet 不擅频繁写入的双重空白。
- **读写特性**:
  - 写:**TabletServer 的 Raft 共识**,强一致性;
  - 读:列式存储 + 谓词下推,OLAP 查询秒级。
- **缺点**:
  1. 生态与 CDH 强绑定,Impala 之外引擎支持薄弱;
  2. 不可水平扩展到 PB 级,社区活跃度低于 Iceberg;
  3. 已不再是主流选择,适合仍在 CDH 体系下的传统大企业。

## 四、方案三:Iceberg + Flink + Trino/Spark(主流湖仓流批一体)

**架构形态**:`Kafka → Flink(CDC + 维表 join) → Iceberg(分层)→ Trino/Spark/StarRocks 查询`。

- **核心能力**:
  - Iceberg Snapshot=ACID + Hidden Partition + Time Travel,让流批写入同一张表;
  - Flink 上的 Paimon 也走 Iceberg 协议,统一元数据;
  - Trino/StarRocks 走 Iceberg REST Catalog,多团队共享同一份数据。
- **优势**:
  1. 真正的存算分离,扩展性强;
  2. 开放表格式,不被任何引擎锁定;
  3. 小文件自动合并,Optimize 任务可控;
  4. 实时层和离线层只差一个 partition(Hour vs Day)。
- **痛点**:
  1. Flink 写入 Iceberg 的小文件问题在高峰需 1 小时合并一次;
  2. 数据可见延迟 30s—2min(Snapshot 提交 + 对象存储一致性);
  3. 维表 join 强依赖外部系统(MySQL CDC、HBase),链路长。

## 五、方案四:Paimon(原 Flink Table Store)

阿里开源、专注流批一体,设计目标就是把**流写入+流更新+OLAP 查询**做成一件事。

- **核心机制**:
  - **LSM 结构**:Mem Table → L0 文件 → 冷文件,天然适合流写入与乱序更新;
  - **Primary Key 表**:支持流式 upsert/delete,带 changelog(producer side)与 changelog(consumer side);
  - **Append Only 表**:适合日志;
  - **Deletion Vector 表**:支持按条件删除。
- **引擎生态**:Flink(读写)、Spark(读写)、Trino、StarRocks、Doris、Apache Hive 4.x。
- **典型场景**:订单变更流、状态机表、维度缓慢变化表。
- **与 Iceberg 的差异**:
  - Iceberg 通用,但 upsert 体验一般(依赖 Flink 的 ProcessTime or EventTime CDC);
  - Paimon 原生主键模型,upsert 性能 5—10 倍领先。

## 六、方案五:StarRocks(实时 OLAP 终点方案)

实时分析的"终局"是 MPP 查询引擎,StarRocks 是当前业内实时数仓查询侧的明星。

- **核心能力**:
  - **CBO + 向量化执行**:单节点多核利用到极致;
  - **多种表模型**:
    - 明细模型(Unique Key):流式 upsert,内置 compaction;
    - 主键模型(Primary Key):delete+update 列级,Paimon 替代品的实时度;
    - 聚合模型(Aggregate Key):SUM/BITMAP/HLL 预聚合,看板秒级;
  - **Catalog 抽象**:对接 Iceberg/Hive/Hudi/Paimon/MySQL/ES,实现联邦查询。
- **典型场景**:实时大屏、BI 加速层、自助分析平台。
- **痛点**:资源密集型,小集群(3 节点以下)体验差,运维需专业 DBA。

## 七、横向对比

| 方案 | 写入延迟 | 查询延迟 | upsert 能力 | 流批一体 | 运维成本 |
|-----|----------|----------|------------|----------|----------|
| HBase + Phoenix | ms | ms | 强 | 弱 | 高 |
| Kudu | s | s | 中 | 中 | 高(CDH 绑定) |
| Iceberg + Flink | s-min | s | 依赖外部 | 强 | 中 |
| Paimon | s | s-min | 原生强 | 强 | 中 |
| StarRocks Primary | s | sub-s | 强 | 弱(查询强) | 中 |

## 八、典型组合(国内互联网大厂)

| 场景 | 主流组合 |
|-----|----------|
| 实时大屏/秒级 BI | Kafka → Flink → StarRocks |
| 实时数仓 + 长周期分析 | Kafka → Flink → Paimon / Iceberg → StarRocks / Trino |
| 维度点查 | Kafka → Flink → HBase + Redis 缓存 |
| 一站式流批 + 中小规模 | Kafka → Flink → Paimon → StarRocks |

## 九、选型建议

- **业务只关心最终查询时延**:直上 StarRocks Primary Key 表;
- **需要保留所有历史(CDC、审计)**:Paimon + 对象存储;
- **不想绑定单一查询引擎**:Iceberg + 多引擎联邦;
- **传统企业、Kafka 老系统**:HBase 短期仍能用,但要从"查询主路"退到"点查边路"。

> **结论**:没有"最好"的实时数仓,只有"最匹配业务"的组合。当下最稳妥的栈是 **Kafka + Flink + Paimon/Iceberg + StarRocks**,既能扛高吞吐,又能保证秒级查询。