# 09｜故障诊断手册：从现象到证据

故障时先保护数据和证据，后恢复服务，再做根因分析。不要在没有快照、时间线和回滚方案时连续改多个参数。

## 1. 通用响应流程

```text
确认用户影响与时间范围
→ 指定事件负责人、记录时间线
→ 冻结高风险变更
→ 判断查询/导入/元数据/存储/依赖哪条路径
→ 收集版本、拓扑、指标、Profile、日志、任务状态
→ 采用最小且可回滚的缓解
→ 验证正确性与 SLO
→ 根因、行动项、演练更新
```

证据按统一时区保存。日志只截错误行而无上下文、只截 CPU 图而不标变更时间，都不足以定位。

## 2. 查询突然变慢

**分流**：单 SQL 还是全局？计划变化还是资源变化？持续还是周期？

检查：

1. SQL/参数/数据范围是否改变；
2. 排队和工作负载组；
3. `EXPLAIN` 与历史计划差异；
4. Profile 最慢 Fragment/Operator；
5. 估算与实际行数、统计新鲜度；
6. 分区裁剪、扫描字节、MV 改写；
7. Join 分发、Exchange、倾斜和 Runtime Filter；
8. BE CPU/内存/spill/磁盘/网络；
9. 同时段导入、Compaction、Schema Change；
10. 外表元数据、对象存储和缓存。

缓解优先级：限流/隔离异常负载 → 回滚最近计划或 Schema 变化 → 修复统计/查询 → 扩容。不要先重启整个集群。

## 3. 导入延迟或失败

检查源 Kafka lag/文件、客户端错误、Stream Load 响应体、label/事务状态、过滤行和错误 URL；再看 FE 队列、BE 写入、Tablet 分布、磁盘和 Compaction。

常见分叉：

- FE/客户端超时但 Doris 已成功：查询 label，不换 label盲重试；
- 过滤率上升：隔离坏数据，不放宽阈值静默丢失；
- 仅一个分区慢：热点 Key/桶倾斜/Tablet 状态；
- 全局写慢且磁盘忙：小批版本或回灌与 Compaction 争用；
- Kafka lag 增长但 Doris 空闲：消费并发、连接器/checkpoint、源分区分配。

恢复后必须做源位点、目标行数和核心指标对账。

## 4. FE 不可用或频繁切换

确认客户端能否连接其他 FE、当前 Master、Follower/Observer 状态、时钟/DNS/网络、磁盘、JVM/内存、元数据日志。频繁选举通常比一次明确故障更危险。

禁止：在未确认多数派和元数据状态时批量重启 FE；删除元数据目录；把 Observer 当可选举节点。缓解后验证元数据写、查询规划、导入提交和客户端重连。

## 5. BE 不可用、Tablet 不健康

检查 BE 心跳、进程、磁盘、网络、日志；同时看不可用 Replica 数、修复队列和剩余副本故障域。先防止同时失去更多副本，再恢复节点或让系统修复。

禁止：直接 DROP 不可用 BE 以消除红色状态；手工删除数据目录；在修复期间连续缩容。节点恢复后确认 Replica 版本一致和修复完成，而非只看 Alive。

## 6. 磁盘告警与 Compaction 堆积

区分数据增长、临时/日志、Trash、Schema Change、副本迁移和 Rowset/Segment 碎片。检查写入批次、Tablet 倾斜、导入峰值和磁盘性能。

短期：停止非关键回灌、限流小批写、增加安全容量、按官方流程清理可清理对象。长期：修正批大小、生命周期、桶布局和容量模型。绝不直接删除 BE 数据文件。

## 7. OOM 与查询取消

先找消耗者：Hash Join build、Distinct/高基数聚合、Sort、宽 Scan、导入、Compaction 或缓存。看 Query Profile PeakMemory/spill、并发和工作负载组。

缓解：取消异常查询、降低特定组并发、修 SQL/Join 顺序/预聚合。提高内存限制只有在物理余量与并发模型允许时才安全；否则把单查询 OOM 变成节点 OOM。

## 8. 结果错误或数据不一致

立即停止相关发布/导入，保留源位点、label、变更和快照。检查：指标口径/SQL 是否改；Join 是否重复；Unique Key 是否错误覆盖或乱序；分区是否缺失；过滤行；时区；近似算法；MV 鲜度；外表快照。

恢复优先从权威源在隔离表重算，对账后做分区交换/受控切换。不要在未知范围内直接 UPDATE 修几个样本。

## 9. 外表或对象存储慢

逐层测：Catalog/Metastore 延迟 → 文件枚举 → 分区裁剪 → 文件数/大小 → 对象存储首字节/吞吐/限流 → 缓存命中 → BE 执行。冷缓存和热缓存必须分开。若源端故障，按业务契约选择降级到最近物化结果、限流或明确失败，不能返回无标记旧数据。

## 10. 最小取证包

```text
精确版本、拓扑、近期变更
事件时间线和影响 SQL/label/job id
FE/BE 健康与资源图
EXPLAIN + Query Profile
相关系统表/SHOW PROC 输出
错误前后日志（脱敏）
数据规模、分区、Tablet/Replica 分布
源系统/对象存储/Kafka 指标
采取的动作与结果
```

## 11. 演练与过关

至少完成：Master FE 切换、单 BE 故障、导入超时后状态不明、磁盘高水位、热点 Key 慢查询、外部存储高延迟。每个场景随机隐藏根因，由另一人按 Runbook 排查。

过关证据必须可复核：

- 保存故障前后 `SHOW FRONTENDS`/`SHOW BACKENDS`、受影响 Tablet/Replica 状态和时间线；
- 保存可重放的 SQL、label/job id、EXPLAIN/Profile 或对应日志片段；
- 记录检测、缓解、恢复时间和用户影响；
- 恢复后行数、关键指标和抽样校验与故障前/权威源一致；
- 写出根因、最小缓解、回滚和预防行动。

只恢复服务但没有对账，不算完成。

参考：[故障排查目录](https://doris.apache.org/docs/4.x/admin-manual/trouble-shooting/)、[Query Profile](https://doris.apache.org/docs/4.x/query-acceleration/query-profile/)、[系统表](https://doris.apache.org/docs/4.x/admin-manual/system-tables/)。

下一章：[结业项目与专家能力评估](10-capstone.md)。
