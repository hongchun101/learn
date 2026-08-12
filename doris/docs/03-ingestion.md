# 03｜数据导入、更新、删除与质量闭环

导入系统的目标不是“接口返回成功”，而是数据在可接受延迟内、恰好以业务允许的次数、以正确语义可查询，并且失败可恢复。

## 1. 导入方式决策

| 方式 | 适合 | 关键控制点 |
|---|---|---|
| `INSERT VALUES/SELECT` | 小批写入、库内转换、外表落地 | 事务、批量、源快照一致性 |
| Stream Load | HTTP 文件/微批、应用直写 | label 幂等、重定向、质量阈值 |
| MySQL Load | MySQL 客户端文件导入 | 客户端能力与文件位置 |
| Broker/S3 Load | 对象存储/HDFS 大批历史数据 | 并行文件、凭据、异步任务状态 |
| Routine Load | Kafka 持续消费 | 分区 offset、并发、暂停与恢复 |
| Flink/Spark Connector | 流批 ETL、CDC、复杂转换 | checkpoint、sink label、版本兼容 |
| Group Commit | 高频小批合并 | 可见性、延迟与吞吐权衡 |

避免“每行一条 INSERT”。它放大解析、事务、版本和 Compaction 开销。

## 2. Stream Load 实战

准备 `orders.csv`，列顺序与映射保持显式。示例要求 `order_date` 使用 ISO `YYYY-MM-DD`，`create_time/update_time` 使用 Doris 可解析的标准 DATETIME 文本；不要依赖隐式转换处理任意本地化日期。非 ISO 输入先在 `columns` 表达式中按当前 4.x 文档显式转换，或在上游标准化。

```bash
curl --location-trusted \
  -u 'loader:REPLACE_ME' \
  -H 'label:orders_20260801_batch_0001' \
  -H 'column_separator:,' \
  -H 'columns:order_id,order_date,user_id,shop_id,order_status,pay_amount,province,create_time,update_time' \
  -H 'max_filter_ratio:0' \
  -T orders.csv \
  'http://fe-host:8030/api/doris_lab/fact_orders/_stream_load'
```

解析 JSON 响应至少检查：`Status`、总行数、成功行、过滤行、未选择行、字节数、耗时、错误 URL。HTTP 2xx 不等于业务成功；客户端必须按响应体判断。

### Label 状态机与留存边界

同一数据库内使用唯一且可推导的 label，例如 `source_topic_partition_start_end`。Label 去重不是永久幂等：Doris 会按保留时间和数量清理历史 label；4.x 的默认值和配置名以当前版本文档为准。超过保留窗口后重用旧 label 可能再次导入，因此必须同时维护源端 offset/事件 ID/清单校验，不能把 Doris label 当作永久去重表。客户端超时后：

1. 不立即换 label；
2. 查询原 label/事务状态；
3. 已成功则提交源 offset；
4. 仍在处理则等待或按策略查询；
5. 明确失败才用符合策略的重试；
6. 永久错误进入隔离区，不无限重试。

标签设计应覆盖业务唯一性窗口：label 中包含来源、分区、起止位点或文件清单摘要；超过 Doris 留存窗口的历史回放，先用源端清单和目标对账/去重表确认，再选择新 label。

## 3. 批量历史导入

大文件导入前先做采样和探查：编码、分隔符、引号、时区、NULL 表示、Decimal 范围、脏行比例。文件既不能细碎到制造调度开销，也不能巨大到失败重试成本过高。

批量回灌流程：

1. 锁定源快照或时间边界；
2. 创建/确认目标分区；
3. 按日期/Hash 切分文件并记录清单、行数、校验和；
4. 提交 Load，持久化 job id/label；
5. 监控完成而非只监控提交；
6. 对账后再开放查询；
7. 有增量流时，以高水位衔接，避免空洞与重叠。

## 4. Kafka 与 CDC

Routine Load 适合直接消费 Kafka；复杂解析、维表关联、跨源和 CDC 通常由 Flink/Spark 连接器处理。端到端“恰好一次”不是一个开关，而是多个边界组合：

```text
源事务/日志位点
  -> Kafka 生产确认
  -> 消费 offset / checkpoint
  -> Doris 导入 label/事务
  -> 可见版本
  -> offset 提交
```

任何两个边界之间都可能崩溃。必须写出恢复矩阵：崩溃发生在 Doris 成功前、成功后但 offset 提交前、checkpoint 完成前后，各会重复还是丢失，模型如何吸收。

CDC 主键表额外处理：

- INSERT/UPDATE/DELETE 映射；
- DDL 演进顺序；
- 全量快照与增量日志的切点；
- 乱序版本和部分更新；
- 主键或分区键变更；
- 时区和 Decimal 精度。

连接器与 Doris 服务端必须核对兼容矩阵，不能只看“都是 4.x”。

## 5. 数据转换和脏数据

把脏数据分成三类：

- **结构错误**：列数、编码、解析失败；
- **类型错误**：溢出、非法日期、精度丢失；
- **业务错误**：负金额、状态跳转非法、外键缺失。

前两类可在导入表达式中有限转换，第三类必须由数据契约和质量规则处理。不要长期提高 `max_filter_ratio` 让错误静默丢失。生产应将原始记录、错误原因、源位点送入隔离表或对象存储，并有重放流程。

## 6. 更新、删除与回灌

- 少量主键更正：Unique Key 覆盖/部分更新；
- 批量重算：优先分区级替换、临时表校验后切换，而不是海量 UPDATE；
- 生命周期删除：删除分区；
- 合规删除：先确认所有明细、聚合、物化视图、备份和外部副本的处理策略；
- Duplicate 表误导入：按可定位谓词删除或重建分区，并先估算 Delete Bitmap/Compaction 影响。

任何破坏性动作必须先给出影响范围查询、备份/恢复点和回滚路径。

## 7. 数据质量四层

1. **传输层**：源/目标文件数、字节、offset 连续；
2. **结构层**：行数、NULL、类型、唯一性；
3. **业务层**：金额守恒、状态机、维度覆盖；
4. **指标层**：与权威系统按日/店铺核对 GMV、订单、UV。

示例断言：

```sql
-- 主键不应为空，金额不应为负
SELECT
  SUM(order_id IS NULL) AS null_keys,
  SUM(pay_amount < 0) AS negative_amounts
FROM doris_lab.fact_orders
WHERE order_date = '2026-08-01';

-- 明细与订单金额差异需解释退款、取消、运费等口径
WITH items AS (
  SELECT order_date, order_id,
         SUM(quantity * unit_price - discount_amount) AS item_amount
  FROM doris_lab.fact_order_items
  WHERE order_date = '2026-08-01'
  GROUP BY order_date, order_id
)
SELECT o.order_id, o.pay_amount, i.item_amount,
       o.pay_amount - i.item_amount AS diff
FROM doris_lab.fact_orders o JOIN items i
  ON o.order_date=i.order_date AND o.order_id=i.order_id
WHERE ABS(o.pay_amount - i.item_amount) > 0.01;
```

## 8. 导入性能诊断

观察：客户端批大小/并发、FE 排队与事务、BE 写吞吐、磁盘、内存、Tablet 分布、Rowset 数、Compaction backlog。常见根因：

- 批次太小 → 版本过多、Compaction 压力；
- 并发太高 → 内存/磁盘竞争，尾延迟上升；
- 分桶键倾斜 → 少数 BE 写热点；
- 索引过多/宽表 → 编码和索引构建成本；
- Unique 高频更新 → Merge-on-Write 与 Delete Bitmap 成本；
- 文件少而巨大或多而细碎 → 并行不足或调度过载。

调优必须同时报告吞吐、可见延迟、失败率、过滤率、Compaction backlog 和查询 P95；只提高 MB/s 可能伤害在线查询。

## 9. 实验

1. Stream Load 同 label 重试，记录 Doris 返回状态；
2. Duplicate 表用新 label 重放，证明重复；再设计去重补救；
3. 注入非法日期和负金额，比较技术过滤与业务隔离；
4. 模拟“Doris 成功、offset 未提交”崩溃，解释恢复结果；
5. 以 1 行、1 千行、10 万行批次比较吞吐和 Rowset/Compaction 指标。

## 10. 过关标准

能画出端到端提交边界，明确每个崩溃点是否丢失/重复；能从响应体、任务状态、源位点和对账四方面证明导入正确。

参考：[数据导入目录](https://doris.apache.org/docs/4.x/data-operate/import/)、[导入最佳实践](https://doris.apache.org/docs/4.x/data-operate/import/load-best-practices/)、[事务](https://doris.apache.org/docs/4.x/data-operate/transaction/)。

下一章：[分析 SQL 与语义正确性](04-querying.md)。
