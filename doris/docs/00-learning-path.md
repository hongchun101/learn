# 00｜学习方法、环境与能力基线

## 1. 学完后应具备什么

专家不是记住最多参数的人，而是能完成以下闭环的人：

1. **定义问题**：数据量、增长率、查询形态、并发、鲜度、SLO、预算和故障域；
2. **建立假设**：例如“扫描未裁剪导致 I/O 高”，而不是“Doris 慢”；
3. **采集证据**：`EXPLAIN`、Profile、系统表、监控、日志、数据分布；
4. **最小变更**：一次只改变一个主要变量；
5. **验证结果**：正确性优先，再比较 P50/P95/P99 和资源消耗；
6. **形成机制**：把结论变成建模规范、告警、容量模型或 Runbook。

## 2. 先修知识

必须会：Linux 基础、SQL 聚合/连接/窗口函数、基本网络与磁盘指标。建议会：Kafka offset、CDC、对象存储、Prometheus/Grafana、JVM 基础。不会的内容应并行补齐，不能用 Doris 参数掩盖基础设施问题。

## 3. 能力基线 <a id="ability-baseline"></a>

开始前闭卷回答，每题写“结论 + 原因 + 如何验证”。答不出是正常的；课程结束后重做。

1. FE、Follower、Observer、BE、Tablet、Replica、Rowset、Segment 分别做什么？
2. 分区和分桶解决的问题有何不同？
3. Duplicate、Unique、Aggregate 模型对相同 Key 的语义是什么？
4. 为什么 `COUNT(DISTINCT user_id)` 可能是瓶颈？BITMAP 与 HLL 如何选？
5. Stream Load 客户端超时后，能否直接换 label 重试？
6. 为什么表行数相同，Join 仍可能相差两个数量级？
7. `EXPLAIN` 与运行时 Profile 分别证明什么？
8. 三副本是否等于备份？为什么？
9. 外表查询慢时，如何区分元数据、对象存储、网络和计算问题？
10. 何时不应选择 Doris？

建议答案不单列。每章会给出组成答案的证据；最后在结业答辩中重新回答。

## 4. 环境分层

| 环境 | 用途 | 最低要求 | 禁止用途 |
|---|---|---|---|
| 本地单节点 | SQL、模型、导入 API | Docker 可运行，MySQL 客户端 | HA、容量、性能结论 |
| 三节点实验集群 | 故障、扩缩容、监控 | 3 FE、3 BE，独立盘或虚机 | 推导生产极限 |
| 性能环境 | 基准和容量 | 固定硬件、隔离流量、数据规模接近生产 | 边跑业务边基准 |
| 预生产 | 变更和恢复演练 | 与生产拓扑/配置同构 | 无审批压测生产数据 |

Windows/macOS 学习者应在 Linux 虚机、WSL2 或 Docker 中运行 Doris。生产部署以官方支持矩阵为准。

## 5. 快速启动

官方 4.x 快速开始提供 `start-doris.sh`。不要复制未知脚本后直接以 root 执行；先阅读内容并固定版本。

```bash
# 下载后先检查脚本，再赋权和启动；版本号应换成你要学习的小版本
chmod 755 start-doris.sh
bash start-doris.sh -v 4.1.0

# 验证 FE/BE；输出中的 alive 应为真
mysql -h127.0.0.1 -P9030 -uroot \
  -e 'SELECT `host`, `join`, `alive` FROM frontends()'
mysql -h127.0.0.1 -P9030 -uroot \
  -e 'SELECT `host`, `alive` FROM backends()'
mysql -h127.0.0.1 -P9030 -uroot -e 'SELECT VERSION()'
```

如果目标版本不存在，访问[下载页](https://doris.apache.org/download)与[快速开始](https://doris.apache.org/docs/4.x/getting-started/quick-start/)选择实际发布版本。教程中的 `replication_num=1` 仅供单 BE 实验。

## 6. 实验记录模板

每个实验保留如下记录。没有基线与原始输出的“变快了”无效。

```text
实验 ID / 日期 / Doris 精确版本 / 节点规格
问题与 SLO：
数据规模与分布：
工作负载（SQL、并发、持续时间、冷热状态）：
基线（P50/P95/P99、QPS、扫描行/字节、CPU、内存、I/O）：
假设与证据：
唯一主要改动：
结果与正确性校验：
回滚方式：
结论适用边界：
```

性能实验至少预热 3 次、正式运行 10 次；报告中同时给冷缓存和热缓存结果。不要只报最小值或平均值。

## 7. 版本纪律

- 会话中先执行 `SELECT VERSION()`；配置审查记录二进制版本和 Git/构建信息。
- 只读与你的小版本对应的文档和 release notes；不要把 2.x 博客里的参数直接放到 4.x。
- 升级前检查：行为变化、废弃项、元数据兼容、回滚限制、生态连接器版本。
- 对版本敏感的参数，先用官方文档或 `SHOW VARIABLES`/配置 API 证明存在，再修改。

## 8. 过关标准

- 可从客户端连接集群，保存 FE、BE、版本查询输出；
- 能解释为什么单节点结果不能证明 HA 或生产性能；
- 建立实验记录目录，完成一次相同 SQL 的冷/热缓存对比；
- 基线 10 题均留下初始答案。

下一章：[架构与第一条查询](01-architecture-quickstart.md)。
