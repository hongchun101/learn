# 模块 15 数据质量

> 数据仓库不是"进了就完"。丢数、重复、口径漂移、空值、迟到的数据、突增的异常——任何一种都会让下游的报表、推荐、风控在一夜之间说出错误的故事。本模块围绕"如何把数据质量变成可观测、可告警、可止血的一项工程能力"展开。

---

## ch01 数据质量框架

### 1.1 什么是数据质量

数据质量衡量的是"数据满足业务期望的程度"。常见的六个维度：

| 维度 | 含义 | 典型问题 |
|---|---|---|
| 完整性 (Completeness) | 字段是否有缺失 | `user_id IS NULL` |
| 准确性 (Accuracy) | 值是否真实 | `age = -1`、`total = -100` |
| 一致性 (Consistency) | 跨表/跨系统是否对得上 | 订单总额 ≠ 订单明细汇总 |
| 时效性 (Timeliness) | 数据是否及时到达 | T+1 的任务在 T+3 才有数据 |
| 唯一性 (Uniqueness) | 主键是否唯一 | `order_id` 重复 |
| 有效性 (Validity) | 值是否在合法集合 | `status='unknown'`、`gender='X'` |

六个维度并不互斥。一个真实问题往往会同时触发多条规则,所以规则之间要保持正交,告警要能去重。

### 1.2 三层质量观

- **源头质量 (Source-side)**:在数据写入 ODS 之前就拦住脏数据。代价最小、收益最大,但要求业务系统配合。
- **管道质量 (Pipeline-side)**:在 ETL/Streaming 任务里嵌入断言,如 `assert row_count > 0`,失败即重跑或告警。
- **消费质量 (Serving-side)**:在 ADS/DWD 服务层做"信任度标注",下游报表可以据此降级或拒绝展示。

工程实践里,源头质量是底线,管道质量是主线,消费质量是兜底。

### 1.3 规则、断言、监控三者区别

- **Rule** :一段声明式的判定,通常是 SQL 的 WHERE 片段,违反即"产生一行"。
- **Assertion** :在某条数据流上,对一组规则的执行结果做布尔判断,True 通过、False 失败。
- **Monitor** :持续运行断言,并把结果落表,加上趋势、阈值、告警通道。

框架设计的核心是:**规则要可移植,断言要可组合,监控要可观测**。

---

## ch02 规则引擎

### 2.1 规则的数据结构

一条规则通常包含:

```
name       规则名,例如 order_id_not_null
sql        判定片段,例如 order_id IS NULL
severity   error | warn,影响是否阻塞
description  描述,供 UI 和告警使用
```

把规则建模成"WHERE 片段 + 计数"是最通用的方案,因为任意引擎(Hive/Spark/Trino/Flink SQL)都能 evaluate。

### 2.2 规则分类

按类型分:

- **结构类**:`column IS NOT NULL`、`PK IN (...)`、`column IN (allowed_set)`
- **范围类**:`column BETWEEN lo AND hi`
- **业务类**:`total = sum(items)`、`status='paid' → pay_ts IS NOT NULL`
- **时序类**:`event_ts 距离 now 不超过 N 小时`、`row_count 与昨日同比 ±50%`
- **统计类**:`列均值 3σ 之外`、`distinct 数量环比异常`

### 2.3 共享的最小规则引擎

本仓库在 `shared/data_quality.py` 提供了一个 200 行内的最小规则引擎,采用 dataclass 定义 Rule / RuleSet,核心 API 是 `evaluate()` 和 `evaluate_sql()`,前者面向 pandas DataFrame,后者面向 SqlRunner,都返回违反行数的 DataFrame。它的特点是:

- SQL 片段即规则,可移植;
- 缺字段、跑错不会抛异常,而是计入 violations;
- severity 默认 error,warn 用作"先放行再观察"。

模块 15 在它之上做扩展,加上 freshness、row_count_min、动态阈值。

---

## ch03 Great Expectations

### 3.1 是什么

[Great Expectations](https://greatexpectations.io) 是 Python 生态最成熟的开源数据质量框架,核心概念:

- **Expectation** :一个原子断言,如 `expect_column_values_to_not_be_null`。
- **Expectation Suite** :一组 Expectation 的集合,等价于 RuleSet。
- **Checkpoint** :对一张表运行 Suite,产出 Validation Result。
- **Data Docs** :静态 HTML 报告,展示每次校验的 Pass/Fail 比例和样例。

### 3.2 在仓库中的定位

GE 适合**离线批处理层** (DWS/ADS) 的校验,尤其是**重要事实表** (GMV、DAU) 在产出前必须通过 Checkpoint。优点:

- 文档即资产,业务方可以直接打开 HTML 看;
- 与 Airflow/Dagster 原生集成,可作为 DAG 节点;
- 支持"分级别 Profile",跑一次看到列分布,再针对性配规则。

### 3.3 局限

- 对流式数据支持较弱 (Checkpoint 假设数据已经落地);
- 启动较重,不建议在 ETL 的每个 transform 里都嵌入;
- 配置文件期望 (Expectation Suites) 容易膨胀,需要治理。

---

## ch04 Soda Core

### 4.1 是什么

[Soda Core](https://www.soda.io) 是 YAML 驱动的轻量质量框架,核心理念是**用配置而非代码**来定义检查:

```yaml
checks for orders:
  - row_count > 0
  - missing_count(order_id) = 0
  - invalid_count(status) = 0:
      valid values: ['created','paid','shipped','completed','cancelled','refunded']
  - freshness(order_ts) < 24h
```

### 4.2 与 GE 的取舍

| 维度 | Soda | GE |
|---|---|---|
| 配置形态 | YAML | Python/SQL |
| 学习成本 | 低 | 中 |
| 流式支持 | Soda Agent + Kafka | 弱 |
| 报告 | Soda Cloud / CLI | Data Docs |
| 适用场景 | CI/CD、临时校验 | 重要事实表固化 |

### 4.3 落地建议

把 Soda 放在**开发环境 / 预发布环境**,开发改完字段先跑一遍 Soda 检查,所有 checks 都通过再合入主线。它非常适合充当"PR 阶段的数据质量门禁"。

---

## ch05 Deequ

### 5.1 是什么

[Deequ](https://github.com/awslabs/deequ) 是 AWS 开源的、基于 Spark 的数据质量库,擅长**自动 profile + 约束推导**。它把"发现约束"和"校验约束"分两步:

1. **Profiler** :跑一次统计,推断每列的 min/max/distinct/null ratio;
2. **Constraint Suggestion** :基于 Profile 自动建议约束;
3. **Verification** :用约束校验数据集,产出 Verification Result。

### 5.2 在 Spark 流水线中的位置

Deequ 与 Spark 原生耦合,所以最适合**每天凌晨跑的批处理事实表**。工程模式:

```
raw_df → Profile.run → ProfileResult
        → ConstraintSuggestion → ConstraintSet
        → Verification.run → metrics.json
        → 写回 metrics 表,触发告警
```

### 5.3 优势与限制

- 优点:免去手写规则的繁琐,自动从历史数据"学习"约束;
- 限制:依赖 Spark,在 DuckDB / Trino 体系下不适用;自动建议的约束需要人工审核,否则可能把"业务异常"误识别为"数据异常"。

---

## ch06 监控与告警

### 6.1 监控指标分层

- **L1 行级**:`null_count`、`distinct_count`、`min/max`,看趋势;
- **L2 业务级**:`GMV`、`DAU`、`支付转化率`,定义 SLO,例如 ±10%;
- **L3 任务级**:DAG 节点成功/失败/重试次数、SLA 超时率。

L1 是技术指标,L2 是业务指标,L3 是平台指标。生产事故往往由 L3 → L2 → L1 追溯根因。

### 6.2 告警阈值

经验值:

- 缺失率突变:>`baseline × 2` 触发 warn,`× 5` 触发 error;
- 行数同比:±50% 触发 warn,±80% 触发 page;
- 关键字段非空:必须 100%,任何非 0 违反都是 page。

阈值不要拍脑袋,要基于"近 7 天 / 近 30 天 P95"动态生成。

### 6.3 告警降噪

- **分组 (Group By)**:同一规则、同一表的多条告警聚合一条;
- **冷却期 (Cooldown)**:同一个规则在 30 分钟内只发一次;
- **值班轮换**:PagerDuty / OpsGenie 分配到人,而不是群发。

---

## ch07 异常检测

### 7.1 统计方法

- **3σ / Z-Score** :适合列值近似正态分布的场景,如金额、点击量;
- **IQR** :四分位距,对长尾更稳健;
- **移动平均 + 阈值带** :看趋势而非单点;
- **同比环比** :消除节假日 / 周末等周期性。

### 7.2 机器学习方法

- **Prophet** :Facebook 开源的时序模型,适合带节假日效应的指标;
- **Isolation Forest** :无监督异常检测,适合"多维指标同时异常";
- **AutoEncoder** :对高维列做重建误差,误差超阈即异常。

机器学习方法的代价是工程复杂度,通常 L2 业务指标才上 ML,L1 技术指标用统计方法即可。

### 7.3 异常 ≠ 错误

异常是"和过去不一样",但"不一样"不等于"错了"。大促期间 GMV 暴增 5 倍是正常的,新业务上线后 DAU 跳变也是正常的。告警平台要支持**标记白名单 / 静默窗口**,避免把好事当坏事。

---

## ch08 落地实践

### 8.1 推荐分层落地

```
源头层 (Source)     ─► schema 校验 + 限流,脏数据直接拒绝
ODS 落地层          ─► row_count + freshness + null check,失败阻塞下游
DWD 清洗层          ─► 业务规则 + 跨表一致性 + Deequ 自动约束
DWS 聚合层          ─► 同环比监控 + 异常检测 + 告警
ADS 应用层          ─► 信任度标注 + 降级策略
```

### 8.2 推荐工具组合

| 层 | 工具 | 作用 |
|---|---|---|
| Source | Kafka Schema Registry | 拒绝非法 payload |
| ODS | Great Expectations | 落地前断言 |
| DWD | Deequ + 自定义规则 | 业务约束 |
| DWS | Soda + 统计监控 | 时效与异常 |
| ADS | 业务侧 trust score | 服务降级 |

### 8.3 度量质量成熟度

- **L0**:跑得起来,但没有质量规则;
- **L1**:关键事实表有 GE / Soda check;
- **L2**:覆盖率 > 80%,告警分级,有值班响应;
- **L3**:全链路血缘 + 自动异常检测 + SLA 报表;
- **L4**:质量分数进入团队 OKR,事故自动复盘。

### 8.4 失败模式与教训

- **"规则堆叠"** :规则多了反而没人看,要分层治理;
- **"过度敏感"** :阈值过严导致每天几百条误报,值班疲劳;
- **"数据治理和质量混淆"** :命名规范、主数据是治理,值校验才是质量,两件事不能绑成一个项目;
- **"上线即遗忘"** :质量规则要随业务演化,建议每季度做一次 review。

---

## 参考与延伸阅读

- shared/data_quality.py :本仓库的最小规则引擎实现
- modules/15-data-quality/src/dq_demo.py :扩展 demo,演示 freshness、row_count、schema、nulls、ranges、business rules
- Great Expectations 官方文档
- Soda Core 官方文档
- Deequ 论文 (VLDB 2019)
