# 数据质量:规则、校验、SLA

## 一、数据质量为什么不是"次要工作"

数据团队的"灭火"工作里,70% 来自数据问题而非算力问题。常见痛点:

- 运营上线后才发现"昨日 GMV 比上周少了一半";
- 风控特征线上线下分数不一致,导致误判;
- A/B 实验结论因为埋点规范不一致相互矛盾;
- 监管报表延迟一晚,合同被罚款。

数据质量直接挂钩业务损失,质量工程因此成为数据中台里最被低估、但 ROI 最高的环节。

## 二、五维质量评估框架

业内广泛采用"五维质量"模型:

| 维度 | 定义 | 典型问题 |
|-----|------|----------|
| **完整性 Completeness** | 必填字段不缺失 | user_id、order_amount 为空 |
| **准确性 Accuracy** | 值在业务正确范围内 | order_amount = -1,user_age = 999 |
| **一致性 Consistency** | 跨系统/跨表口径一致 | 实时 GMV ≠ 离线 GMV |
| **唯一性 Uniqueness** | 同一业务键只能出现一次 | 同一订单号出现两行 |
| **及时性 Timeliness** | 数据在约定时间内到达 | T+1 表晚 3 小时 |

可加入的第六维度:**合规性**(GDPR、个保法)——字段脱敏、跨境传输。

## 三、质量规则引擎

### 1. 完整性规则

- **字段级**:`NOT NULL` 比率必须达到 X%(一般 ≥ 99.99%);
- **行级**:`COUNT(*) - COUNT(IF(col IS NULL, 1, 0)) / COUNT(*)` ≤ 0.01%。

```sql
-- Hive / Spark SQL 完整性检测示例
SELECT COUNT(*) AS total,
       COUNT(user_id) AS non_null,
       COUNT(*) - COUNT(user_id) AS null_cnt,
       ROUND((COUNT(*) - COUNT(user_id)) / COUNT(*), 4) AS null_rate
FROM dwd_user_event
WHERE dt = '${date}'
HAVING null_rate > 0.0001;
```

### 2. 准确性规则

- **值域正则**:`order_amount` 必须 `>= 0`;
- **业务语义**:`order_status` 必须在 `{待支付, 已支付, 已退款, 已关单}`;
- **跨表勾稽**:`总订单金额 = SUM(order_amount)`,不差分毫。

### 3. 一致性规则

- **实时 vs 离线**:根据表等级定义允许误差(通常 ≤ 0.5%);
- **国内国外 vs 全球汇总**:`sum(各国 GMV) = 全球 GMV` 不允许 ±0.5% 偏差;
- **同一指标在 ODPS / Hive / Iceberg / 数仓层**必须指向同一口径。

### 4. 唯一性规则

```sql
SELECT order_id, COUNT(*) AS cnt
FROM dwd_trade_order
WHERE dt = '${date}'
GROUP BY order_id
HAVING cnt > 1;
```

### 5. 及时性规则

- **`last_update_time` ≤ schedule_deadline`(分区粒度)`** —— 表级 SLA;
- **`event_time` 与 `proc_time` 偏差 ≤ N 分钟** —— 流式数据延迟监测。

## 四、校验框架实现

业内主流选择:**Apache Griffin**、**Datafold**、**Great Expectations**、**Deequ**(Spark 原生)。

| 框架 | 优势 | 不足 |
|-----|------|------|
| Great Expectations | Python 生态,可视化"Expectation Suite" | 引擎集成依赖 Spark/Hive 外部调度 |
| Deequ | Spark 原生,在大数据集上有性能 | 仅 Scala/Python 强,UI 较弱 |
| Apache Griffin | 国内常用,UI 全、连接器多 | 部署稍重 |
| Datafold | 云原生,SLA & 监控漂亮 | 商业版收费 |

### 1. 通用组件

```
Source Data → Profile → Expectation Suite → Rule Engine
                                              │
                                              ▼
                                        Pass / Warn / Block
                                              │
                                              ▼
                                     报警 + 阻断任务 + 通知
```

### 2. 自研质量平台的 8 个核心模块

1. **规则中心**(Expectation Definition):JSON / YAML 描述;
2. **采样器**:按表大小动态决定全量/抽样检测;
3. **执行引擎**:Spark/Flink/Trino 三种执行后端;
4. **结果采集**:把失败任务结果写回 Kafka;
5. **告警中心**:与告警平台(OpsGenie/PagerDuty/钉钉)联动;
6. **阻塞开关**:重要等级 L0/L1 表不通过则阻断下游调度;
7. **数据预览**:在 UI 上把异常值展示给 Owner;
8. **指标面板**:把"每天质量通过率"作为公司级治理指标。

## 五、DQ SLA 的设计

### 1. 表分级

| 等级 | 场景 | 阻断策略 | 留存要求 |
|-----|------|----------|----------|
| **L0 财务/合规** | 合同、税务、审计 | 必须 L1 验证通过才放行 | 永久 + WORM |
| **L1 业务核心** | GMV、用户、订单主表 | 完整性和准确性必过 | 1 年 |
| **L2 分析报表** | DWS/ADS | 不通过要发告警,block level up | 90 天 |
| **L3 探索层** | 临时实验表 | 仅留 passed/failed 状态 | 30 天 |

### 2. DQ 报告与回溯

每个任务产 1 张 DQ 报告表,记录:

| 字段 | 含义 |
|-----|------|
| `task_id` | 调度任务唯一标识 |
| `table` | 数据表 |
| `partition` | 分区 |
| `rule_id` | 规则标识 |
| `run_time` | 校验时间 |
| `expectation` | 规则表达式 |
| `actual_value` | 实际值 |
| `passed` | 1=通过,0=失败 |
| `severity` | Critical/Major/Minor |

### 3. 月度评分卡

每月发布治理评分:

- **Table Score**:每张表的 5 维度得分加权;
- **Domain Score**:域内表平均分;
- **Team Score**:平台/数据团队整体得分;
- **Owner Score**:数据负责人合规率。

## 六、数据质量异常的处理剧本

1. **告警**:第一时间通知 Owner(Data Steward),按 SLA 时间响应;
2. **回溯**:回刷历史分区,同时拉黑下游消费;
3. **根因**:对照 ETL 链路,定位到模块(SQL、Job、Source);
4. **修复**:Issue Tracking,加 case test 防止再发;
5. **复盘**:月度发布"Case Study",团队共享经验。

## 七、面试高频问题

- "完整性和唯一性哪个更优先?" — 完整性 L0,L1;唯一性 L1,L2。不同等级不同做法。
- "质量规则怎么避免误报?" — 抽样 + 动态阈值 + 历史均值 + 噪声过滤。
- "数据契约和质量关系?" — 契约是左移(producer 端),质量是检测(consumer 端)。两层协作。
- "如果半夜告警了,怎么定位?" — DQ Dashboard + Last-N-partition trend + ETL log + Source change。
- "流批数据质量差异在哪?" — 流上完整性靠 lineage;批上一致性靠 cross-check。

> **结论**:数据质量不是"事后检查",而是生产流程的左侧植入——Schema 校验、契约、规则、补数和验证闭环。组织上要让"数据 Owner"为分数负责,质量指标才能真正被当成业务指标而非 IT 指标。