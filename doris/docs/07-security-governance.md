# 07｜安全、权限、审计与资源治理

安全不是最后添加的用户表。它从网络边界、身份、授权、数据分级、审计、密钥轮换和资源隔离共同成立。

## 1. 最小权限

按角色而不是按个人授予权限：

| 角色 | 需要 | 不需要 |
|---|---|---|
| BI Reader | 指标库 SELECT、必要的执行权限 | DDL、导入、系统管理 |
| Batch Loader | 指定表 INSERT/Load、任务状态 | 任意库读写、节点管理 |
| Data Steward | 数据质量查询、受控修复 | FE/BE 配置 |
| DBA | 集群和元数据操作 | 直接共享给应用 |
| Break-glass | 临时高权限、审批、审计 | 日常使用 |

应用账号分开：读取、导入、运维不能共用 root。权限按库/表/列/行能力和实际版本支持情况落地；先在隔离用户验证。

## 2. 身份与凭据

- 禁止把密码放进 SQL、脚本、Git、日志和错误响应；
- 使用 TLS、密钥管理系统和短期凭据；
- 定期轮换并验证连接器、BI、备份任务；
- 允许/拒绝网络来源，缩小 FE/BE 管理端口暴露面；
- 记录账号、来源、SQL、结果、耗时和对象，但按隐私规范脱敏。

教学命令可使用 root；生产 Runbook 必须替换为专用账号和安全存储。

## 3. 数据分级

把用户手机号、地址、设备标识、支付信息等归类，建立：

- 谁能看原值、脱敏值、聚合值；
- 是否需要列级/行级权限或视图；
- 导出、外表、缓存、备份是否继承限制；
- 生命周期和删除证明；
- 审计保留期与访问告警。

权限测试要用正向和负向用例：允许的查询成功，不允许的查询明确失败；不能仅检查 GRANT 文本。

## 4. 资源治理

查询、导入和后台任务可能争抢资源。Workload Group 是 **BE 进程内** 的查询/导入 CPU、内存、扫描 I/O 与并发治理机制（具体语法依版本）：

- BI 交互查询：低延迟、受控并发；
- 大批报表：限并发、可排队；
- 回灌导入：绑定低优先级组并安排窗口；
- 关键实时链路：保留 CPU/内存和鲜度预算。

Workload Group **不管理 Compaction**，共享缓存和 RPC 线程池也不能完全隔离。Compaction 压力应从导入批次、节奏、Tablet 布局和专用资源着手；需要硬隔离时使用专属 BE 的 Resource Group 或存算分离 Compute Group。配额设计以压力测试验证，记录拒绝、排队、超时和饥饿。过度细分组会增加管理成本；没有用户到资源组的稳定映射就没有隔离。

## 5. 审计与变更

审计事件：登录失败、权限变更、DDL、导入、DELETE/UPDATE、导出、配置变更、节点操作。变更单至少包括：目的、影响、前置检查、备份点、步骤、观测项、停止条件、回滚。

紧急操作也要事后补审计。日志中避免记录完整凭据和敏感字段。

## 6. 安全实验

以下 SQL 只在隔离实验库执行；口令是教学占位符，生产从密钥管理系统注入。按当前 4.x RBAC 语法建立角色、账号和最小权限。每套实验环境只执行一次；重跑前按当前版本执行对应 DROP/REVOKE：

```sql
CREATE ROLE tutorial_reader;
CREATE ROLE tutorial_loader;
CREATE ROLE tutorial_operator;

GRANT SELECT_PRIV ON internal.doris_lab.* TO ROLE tutorial_reader;
GRANT LOAD_PRIV ON internal.doris_lab.fact_orders TO ROLE tutorial_loader;
GRANT USAGE_PRIV ON WORKLOAD GROUP 'bi_interactive' TO ROLE tutorial_reader;
CREATE USER 'tutorial_bi'@'127.0.0.1' IDENTIFIED BY 'Replace-Only-In-Lab-9!'
  DEFAULT ROLE tutorial_reader;
CREATE USER 'tutorial_loader'@'127.0.0.1' IDENTIFIED BY 'Replace-Only-In-Lab-9!'
  DEFAULT ROLE tutorial_loader;
SHOW GRANTS FOR 'tutorial_bi'@'127.0.0.1';
SHOW GRANTS FOR 'tutorial_loader'@'127.0.0.1';
```

使用独立连接做负向测试：`tutorial_bi` 的 `SELECT` 应成功，`CREATE TABLE`、`INSERT`、`DROP` 应失败；`tutorial_loader` 的目标表导入应成功，读未授权表和节点管理应失败。记录原始错误和 `SHOW GRANTS` 输出。`bi_interactive` 若尚未创建，先按当前 Workload Group 文档创建并授权；存算分离模式还要绑定 Compute Group。

列权限和行策略不是凭空存在：先用脱敏视图/受控列授权表达业务，再按当前版本的 `CREATE ROW POLICY` 文档做隔离实验。审计插件启用后执行一次允许和一次拒绝访问，确认审计事件已落盘且敏感值脱敏。

1. 建立 reader、loader、operator 三个角色；
2. 用独立账号做允许/拒绝矩阵；
3. 轮换导入凭据，证明旧凭据失效且无中断窗口；
4. 用资源组制造大查询与 BI 并发，观察 P95、排队和导入鲜度；
5. 审查一周审计日志，找出未授权或异常导出路径。

## 7. 过关标准

能给出权限矩阵、密钥生命周期、敏感数据路径图和资源隔离压测报告。任何“root 账号给应用使用”“把 TLS 关掉排查”“无限制大查询”都属于一票否决项。

参考：[认证与授权](https://doris.apache.org/docs/4.x/admin-manual/auth/)、[审计插件](https://doris.apache.org/docs/4.x/admin-manual/audit-plugin/)、[工作负载管理](https://doris.apache.org/docs/4.x/admin-manual/workload-management/)。

下一章：[Lakehouse、存算分离与高级能力](08-lakehouse-advanced.md)。
