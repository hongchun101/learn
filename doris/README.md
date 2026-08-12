# Apache Doris 4.x 从入门到专家

> 面向数据工程师、数仓工程师、DBA 与架构师的生产实践教程。基线：Apache Doris 4.x；最后校对日期：2026-08-07。

这不是 SQL 语法清单。全教程围绕一个电商实时分析平台，要求你完成建模、导入、查询、调优、治理、故障演练和容量设计。完成所有实验与结业项目，才算达到这里定义的“专家级”：能解释原理、用证据定位问题、作出有约束的架构决策，并安全地运维生产集群。

## 使用前说明

- Doris 迭代快。**原理、诊断方法和决策框架**比某个参数名更稳定。
- 示例以 4.x 为目标；执行版本敏感的 DDL、配置项或运维命令前，必须用 `SELECT VERSION()` 确认版本，并查看对应小版本的[发布说明](https://doris.apache.org/docs/4.x/releasenotes/)。
- 快速实验用单副本；生产必须按故障域设计多副本。不要复制实验配置到生产。
- 本教程不会承诺“读完即专家”。专家能力来自完成实验、保存证据、复盘失败。

## 学习路线

| 阶段 | 章节 | 产出 | 建议实践量 |
|---|---|---|---:|
| 基础 | [学习方法与环境](docs/00-learning-path.md)、[架构与第一条查询](docs/01-architecture-quickstart.md) | 可用单节点环境、架构讲解 | 6 小时 |
| 建模 | [表模型与物理设计](docs/02-data-modeling.md) | 电商数仓表、设计评审 | 12 小时 |
| 数据链路 | [数据导入、更新、删除与质量闭环](docs/03-ingestion.md) | 批流一体导入方案 | 12 小时 |
| SQL | [分析 SQL 与语义正确性](docs/04-querying.md) | 指标 SQL、核对用例 | 10 小时 |
| 性能 | [执行原理与系统化性能调优](docs/05-performance.md) | Profile 证据、基准报告 | 18 小时 |
| 生产 | [部署、可观测性、升级与灾备](docs/06-operations.md) | SLO、告警、变更与灾备手册 | 18 小时 |
| 治理 | [安全、权限、审计与资源治理](docs/07-security-governance.md) | 最小权限、工作负载隔离 | 8 小时 |
| 进阶 | [Lakehouse、存算分离与高级能力](docs/08-lakehouse-advanced.md) | 架构选型与 POC | 12 小时 |
| 专家 | [故障诊断手册：从现象到证据](docs/09-troubleshooting.md)、[结业项目与专家能力评估](docs/10-capstone.md) | 故障演练记录、架构答辩 | 独立工作坊 |

推荐顺序是 00 → 10。已有 Doris 经验者也应先做[能力基线](docs/00-learning-path.md#ability-baseline)，不要仅凭工作年限跳章。表内小时是基础路径参考量，不含需要真实数据、恢复和故障演练的结业工作坊；结业项目至少另预留 40 小时。

## 示例工程

`examples/ecommerce/` 是贯穿课程的最小电商数据集：

1. 执行 [`schema.sql`](examples/ecommerce/schema.sql) 创建 Duplicate、Unique、Aggregate 三类模型；
2. 执行 [`seed.sql`](examples/ecommerce/seed.sql) 写入确定性数据；
3. 执行 [`queries.sql`](examples/ecommerce/queries.sql) 验证结果和练习分析 SQL；
4. 在第 3、5 章把数据扩大，接入 Stream Load/Kafka，并用 Profile 做调优。

```bash
mysql -h127.0.0.1 -P9030 -uroot < examples/ecommerce/schema.sql
mysql -h127.0.0.1 -P9030 -uroot < examples/ecommerce/seed.sql
mysql -h127.0.0.1 -P9030 -uroot < examples/ecommerce/queries.sql
```

## 专家必须掌握的决策

- 什么时候选明细模型、主键模型、聚合模型，而不是“全部用 Unique Key”。
- 分区负责生命周期与裁剪，分桶负责并行与数据分布；如何根据数据量、节点数、并发和倾斜选键。
- 导入成功究竟表示什么；如何以 label、源 offset、检查点和对账构造可恢复的数据链路。
- 为什么查询慢：计划差、扫描多、Shuffle 大、倾斜、资源争用、Compaction 压力还是远端 I/O。
- 何时用索引、同步/异步物化视图、预聚合、缓存、Colocate，何时它们会增加写放大或运维成本。
- 如何定义并验证 RPO/RTO、备份可恢复性、滚动升级和容量余量。
- 如何在内表、外部 Catalog、存算一体、存算分离之间做可量化选型。

## 完成标准

只有同时满足以下条件才完成课程：

- 所有章节的“过关标准”都留下了命令输出、SQL 结果或设计文档；
- 在百万级以上自造数据上完成一次可复现的性能优化，给出优化前后 P50/P95、扫描量、CPU/内存和 Profile 差异；
- 完成至少 4 个故障演练，其中必须包含 FE 切换、BE 不可用、导入重复/中断、磁盘或对象存储异常；
- 从备份恢复到隔离集群并做行数、关键指标与抽样校验；
- 通过第 10 章的结业项目和 100 分自评表，且没有“一票否决项”。

## 官方资料

教程负责建立心智模型和训练路径，官方文档负责给出你所运行版本的精确语法：

- [Doris 4.x 概览](https://doris.apache.org/docs/4.x/getting-started/what-is-apache-doris/)
- [5 分钟快速开始](https://doris.apache.org/docs/4.x/getting-started/quick-start/)
- [系统架构](https://doris.apache.org/docs/4.x/features-architecture/system-architecture/)
- [表设计](https://doris.apache.org/docs/4.x/table-design/)
- [数据操作与导入](https://doris.apache.org/docs/4.x/data-operate/)
- [性能与调优](https://doris.apache.org/docs/4.x/query-acceleration/performance-tuning-intro/)
- [Lakehouse](https://doris.apache.org/docs/4.x/lakehouse/)
- [管理手册](https://doris.apache.org/docs/4.x/admin-manual/)

## 边界

本教程讲开源 Apache Doris，不替代云厂商产品文档、组织安全规范或变更审批。硬件规格、数据规模、SLA 不同，不存在可直接照抄的“万能参数”。
