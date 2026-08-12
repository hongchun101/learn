# 06｜部署、可观测性、升级与灾备

本章把“能跑”提升为“可运营”。命令、端口和配置项高度版本相关，执行前以 4.x 对应小版本文档为准。

## 1. 拓扑与故障域

生产设计先写故障模型：单进程、单盘、单机架、可用区、区域、对象存储、网络分区分别怎么坏。

### 存算一体基线

- FE：生产多节点，选举节点分布在故障域；Observer 只在确认读扩展需求后增加；
- BE：至少跨故障域，副本数和故障域标签匹配；
- 客户端：连接可用 FE 列表或代理，不把单个 FE 写死；
- 磁盘：数据、日志、临时空间按容量和 I/O 分析；
- 时间同步、DNS、NTP、文件句柄、内核参数、Java 版本按官方前置条件落实。

三副本不等于三台同机架。副本位置必须覆盖你声明的故障域。

### 存算分离基线

额外评估 Meta Service、对象存储、缓存盘、计算组和凭据。分别测：热缓存、冷缓存、对象存储限流、元数据服务故障、计算组扩缩和网络中断。

## 2. 安装原则

本地快速开始适合学习；生产采用官方发布包/镜像和受控配置，不手工拼装未验证依赖。执行前：

```bash
# 只读检查，不要把结果当作生产验收
uname -a
java -version
ulimit -n
# Linux 上按官方要求检查虚拟内存区域等内核设置
sysctl vm.max_map_count
```

使用专用账号，不用 root 启动服务。保存：二进制 checksum、配置版本、环境清单、端口矩阵、启动/停止方式。

## 3. 健康检查

基础 SQL：

```sql
SELECT VERSION();
SHOW FRONTENDS;
SHOW BACKENDS;
```

需要查看内部子树时再使用版本对应的 `SHOW PROC` 路径；不要把 `SHOW PROC '/frontends'` 当作日常健康检查。

检查不应止于 Alive：

- FE 选举/元数据同步状态；
- BE 心跳、磁盘、节点是否被屏蔽；
- Tablet 副本健康、修复队列、版本堆积；
- 导入任务成功率、延迟和过滤率；
- Compaction backlog；
- 查询排队、失败、内存和慢 SQL；
- 日志错误率与网络连接。

系统表、`SHOW PROC` 和 Web/API 在不同版本的字段可能改变。Runbook 要记录“如何发现字段变化”，而不是只粘贴一条旧 SQL。

## 4. 监控与 SLO

### 服务 SLO 示例

| SLI | 示例目标 | 说明 |
|---|---:|---|
| 查询可用率 | 99.9% | 按业务错误定义，不把客户端断开全算 Doris |
| 核心报表 P95 | < 3 s | 固定查询集合与数据范围 |
| 实时鲜度 P95 | < 60 s | 源事件时间到可查询时间 |
| 导入成功率 | > 99.9% | 过滤行按契约另计 |
| 副本修复 | 99% 在 30 min 内 | 按 Tablet 大小分层 |
| 恢复 | RTO/RPO 有明确数字 | 每季度实测，不靠声明 |

### 看板分层

1. **用户层**：QPS、P95/P99、错误、鲜度；
2. **FE 层**：连接、线程/队列、规划延迟、元数据、选举；
3. **BE 层**：CPU/内存、磁盘、网络、Query/Load/Compaction；
4. **数据层**：Tablet/Replica、版本、Rowset、分区、数据倾斜；
5. **依赖层**：Kafka lag、对象存储请求/错误、DNS、网络。

告警要有级别、去重、抑制和 Runbook。监控“CPU 90%”没有动作含义，监控“核心报表 P95 连续 10 分钟超 SLO 且 Scan bytes 未变”才接近可行动告警。

## 5. 日常运维

### 扩容

先判断瓶颈是存储容量、扫描 CPU、网络、并发隔离还是导入吞吐。加 BE 不能自动修复错误分桶和数据倾斜；验证 Tablet 均衡和数据迁移成本。扩 FE 不能替代 BE 计算能力。

### 缩容

确认副本、Tablet、查询和导入已安全迁移；维护窗口保留余量；观察修复、网络和查询尾延迟。任何节点操作都要有回滚路径。

### Schema Change

在同规模预生产测耗时、磁盘峰值、写入阻塞、查询影响和失败恢复。大表避免在高峰随意改类型/Key；先评估新表回填 + 校验 + 切换是否更安全。

### 分区与数据生命周期

按保留策略自动化创建/删除，设置“未来分区缺失”“删除失败”“无分区写入”告警。删除前输出影响范围和备份点。

## 6. 备份、恢复与灾备

4.x 原生 `BACKUP/RESTORE` 的前置条件必须先核对：存算一体模式、FE/BE 都能访问远端 Repository、执行账号有 ADMIN 权限；当前 4.x 文档明确说明存算分离模式不支持这套备份恢复，异步物化视图也不在快照范围内。存算分离环境应另建对象存储快照/表级导出方案并单独演练。

下面是**存算一体实验**的最小流程。把密钥换成短期凭据，禁止提交到 Git：

```sql
-- 以 MinIO/S3 为例；端点、桶、凭据按实验环境替换
CREATE REPOSITORY `tutorial_repo`
WITH S3 ON LOCATION "s3://tutorial-bucket/doris_lab"
PROPERTIES (
    "s3.endpoint" = "https://s3.example.invalid",
    "s3.region" = "us-east-1",
    "s3.access_key" = "REPLACE_ME",
    "s3.secret_key" = "REPLACE_ME"
);

USE doris_lab;
BACKUP SNAPSHOT `doris_lab_snapshot_20260807`
TO `tutorial_repo`;
SHOW BACKUP;
SHOW SNAPSHOT ON `tutorial_repo`;
```

记录 `SHOW BACKUP` 的 `State=FINISHED`、`Status=[OK]` 和 `SHOW SNAPSHOT` 返回的 `Timestamp`。在隔离数据库/集群执行恢复（用实际 timestamp 替换）：

```sql
CREATE DATABASE restore_lab;
RESTORE SNAPSHOT restore_lab.`doris_lab_restore_20260807`
FROM `tutorial_repo`
PROPERTIES ("backup_timestamp"="REPLACE_WITH_TIMESTAMP");
SHOW RESTORE;
```

只有 `SHOW RESTORE` 为 `FINISHED` 且状态为 OK 才算恢复成功。随后对比源/恢复库的表清单、分区、行数、主键唯一性、金额汇总、核心指标和抽样哈希。注意官方限制：快照不保留 `colocate_with`，动态分区可能需要恢复后重新启用；每个数据库同时只能运行一个备份/恢复任务。

备份对象不止数据：表 DDL、权限、Catalog、连接配置、作业定义、指标口径、版本与参数也必须可重建。副本只防节点故障，不防误操作。

恢复 Runbook：

1. 宣布事故范围并冻结高风险写入；
2. 选择恢复点，记录 RPO；
3. 先恢复隔离环境，不覆盖生产；
4. 恢复 DDL/权限/数据；
5. 行数、分区、主键唯一性、金额和核心报表对账；
6. 记录耗时并计算 RTO；
7. 业务验收后切换；
8. 复盘缺口并更新自动化。

至少每季度做一次从真实备份恢复，不接受“备份文件存在”作为证据。

## 7. 升级与回滚

升级前检查：

- 版本兼容和 release notes；
- 连接器、驱动、BI、Catalog 兼容；
- 语法、计划、结果和性能回归；
- 元数据/数据格式迁移与不可逆操作；
- 备份恢复证明；
- 监控、日志、容量余量；
- 分批、暂停条件、回滚路径和负责人。

灰度顺序按官方升级指南；不要只升级一个生产 FE/BE 后凭感觉继续。回滚不是“换回旧二进制”这么简单，必须验证元数据和数据格式可逆性。

## 8. 故障演练

- 停止一个 BE：验证查询、导入、Replica 修复和告警；
- 停止当前 Master FE：验证选举、客户端重连和元数据写；
- 打满实验盘：验证写入失败、查询、清理和恢复；
- 暂停 Kafka：验证 lag 告警、补消费和鲜度恢复；
- 注入对象存储高延迟：验证冷缓存查询、重试和资源隔离；
- 制造错误导入：执行隔离、回滚和重放。

每次演练记录时间线、检测时间、缓解时间、数据损失、用户影响和 Runbook 缺口。

## 9. 过关标准

能提交一份生产运行手册：拓扑、端口、SLO、看板、告警、扩缩、备份恢复、升级回滚和 4 个故障演练结果。每项都带验证证据与版本。

参考：[管理手册](https://doris.apache.org/docs/4.x/admin-manual/)、[集群管理](https://doris.apache.org/docs/4.x/admin-manual/cluster-management/)、[监控维护](https://doris.apache.org/docs/4.x/admin-manual/maint-monitor/)、[故障排查](https://doris.apache.org/docs/4.x/admin-manual/trouble-shooting/)。

下一章：[安全与资源治理](07-security-governance.md)。
