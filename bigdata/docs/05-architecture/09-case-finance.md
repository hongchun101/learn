# 案例:金融风控与反欺诈数据平台

## 一、项目背景与规模

- **业务形态**:消费金融 + 信用卡反欺诈 + 信贷风控,服务 4.5 亿用户(其中信用用户 1.8 亿);
- **决策量级**:实时决策峰值 12 万 QPS,平均 3.5 万 QPS;每天新增信贷申请 500—800 万笔,其中被反欺诈拦截 18%,被拒 22%;
- **数据规模**:全量行为数据 80TB/日,特征库 4PB,模型 200+,规则 3000+;
- **业务痛点**:
  1. 离线特征延迟:T+1 特征无法支持实时反欺诈决策;
  2. 特征回溯:监控到模型漂移时,无法在 1 小时内回看 30 天任一时刻的特征;
  3. 多头借贷:跨域征信数据接入后,实时关联到用户多头借贷识别延迟 10 分钟,造成漏判 6.7%。

## 二、目标设定

1. **线上特征计算 P99 延迟 ≤ 50ms**(主决策链路);
2. **离线特征回刷时长** — 90 天回溯 200+ 特征 4 小时内完成;
3. **决策可解释** — 任何一笔拒绝必须有"被哪条规则命中、特征值是什么";
4. **合规可审计** — 任何特征访问留痕,GDPR 遗忘权 1 小时内执行完。

## 三、技术选型理由

| 场景 | 选型 | 关键理由 |
|-----|------|----------|
| 消息总线 | Kafka 3.x | 大量实战经验,多语言 SDK 完善 |
| 流处理 | Flink 1.18 | Stateful + Exactly-once + RocksDB state backend |
| 在线特征存储 | Redis 7.x + TiKV(部分大对象) | Redis sub-ms 响应;TiKV 写特征版本化快照 |
| 离线特征存储 | Iceberg + StarRocks | 联邦查询,T+1 培训样本构建 |
| 特征编排 | Feast(Feast + Iceberg) | Feature Store 标准,版本化模型 |
| 模型部署 | TensorFlow Serving + Triton | 在线低延迟推理 |
| 决策引擎 | 自研规则引擎 + Liteflow | 3000+ 规则,灰度发布 |
| 监控 | Prometheus + Grafana + OpenTelemetry | 同 e-commerce 案例,统一平台 |

## 四、整体架构

```
┌─────────────────────────┐    ┌──────────────────────┐
│ App / Loan / Channel SDK │    │ Partner API / 征信   │
└──────────┬──────────────┘    └──────────┬────────────┘
           ▼ (HTTPS)                      ▼ (Kafka / API Gateway)
        Kafka: behavior                  Kafka: third_party
           │
  ─────────┼──────────
  ▼        ▼        ▼
Flink  Flink    Flink CDC
(特征加工) (实时决策) (维表维护)
  │
  ├──→ Redis(线上特征)
  ├──→ TiKV(特征版本快照)
  ├──→ Iceberg(离线特征)
  │
  ▼
Real-time Service
  │ (gRPC)
  ▼
Decision Engine
  │
  ├──→ Rule Engine (3000+ 规则)
  ├──→ Model Inference(TF Serving)
  │
  ▼
Audit Log / Anti-fraud event (Kafka)
  │
  ▼
DB  / Reporting
```

## 五、关键 Topic / 数据模型

### 1. Kafka Topic:`risksource.behavior.event`

客户端 SDK 上报,统一信封。

```json
{
  "fields": [
    {"name": "event_id", "type": "string"},
    {"name": "user_id", "type": "string"},
    {"name": "device_id", "type": "string"},
    {"name": "ip", "type": "string"},
    {"name": "event_type", "type": {"type": "enum", "symbols": ["LOGIN","APPLY","MODIFY","UPLOAD","CLICK"]}},
    {"name": "biz_subtype", "type": "string"},
    {"name": "channel", "type": "string"},
    {"name": "amount", "type": ["null", "double"]},
    {"name": "latency_ms", "type": ["null", "long"]},
    {"name": "client_ts", "type": "long", "logicalType": "timestamp-millis"},
    {"name": "server_ts", "type": "long", "logicalType": "timestamp-millis"},
    {"name": "geo", "type": {"type": "record", "fields": [
        {"name": "lat", "type": "double"},
        {"name": "lon", "type": "double"}
    ]}},
    {"name": "tags", "type": ["null", {"type": "map", "values": "string"}]}
  ]
}
```

### 2. Kafka Topic:`risk.thirdparty.credit`

外部征信接口异步回调。

```json
{
  "fields": [
    {"name": "query_id", "type": "string"},
    {"name": "user_id", "type": "string"},
    {"name": "providers", "type": {"type": "array", "items": "string"}},
    {"name": "decision_status", "type": "string"},
    {"name": "score", "type": ["null", "double"]},
    {"name": "loan_records", "type": {"type": "array", "items": {"type": "record", "fields": [
        {"name": "loan_id", "type": "string"},
        {"name": "amount", "type": "double"},
        {"name": "issued_at", "type": "long", "logicalType": "timestamp-millis"},
        {"name": "platform", "type": "string"}
    ]}}},
    {"name": "risk_signal", "type": ["null", "string"]},
    {"name": "response_at", "type": "long"}
  ]
}
```

### 3. Redis 线上特征:`feature:user:{user_id}`

```json
{
  "user_id": "u_3001",
  "version": 1842,
  "computed_at": 1729800034,
  "values": {
    "apply_cnt_1d": 4,
    "apply_amt_7d_avg": 6400.5,
    "device_cnt_30d": 7,
    "multi_loan_score": 0.83,
    "geo_velocity_max_1h": 1240.2,
    "rules_triggered_7d": ["R221","R305"]
  }
}
```

### 4. Iceberg 离线特征表:`risk.feature_offline.user_credit_30d`

T+1 训练 + 监控 + 回溯使用。

| 字段 | 类型 | 说明 |
|-----|------|------|
| `user_id` | STRING | |
| `dt` | DATE | |
| `loan_cnt_30d` | INT | 30 天贷款次数 |
| `overdue_cnt_90d` | INT | 90 天逾期次数 |
| `overdue_amt_90d` | DECIMAL(18,2) | |
| `multi_platform_cnt_30d` | INT | 30 天跨平台借贷数 |
| `device_change_cnt_7d` | INT | 设备变更数 |
| `ip_geo_dispersion` | DOUBLE | ip 地理分散度 |
| `label_default` | INT | 是否违约(0/1) |
| `feature_version` | INT | 对应 Redis 版本 |

### 5. 风控决策结果表:`risk.dwd.anti_fraud_decide`

反欺诈审计主表(Iceberg),保存 1 年。

| 字段 | 类型 | 说明 |
|-----|------|------|
| `decision_id` | STRING | UUID |
| `user_id` | STRING | |
| `event_type` | STRING | APPLY/LOGIN... |
| `model_score` | DOUBLE | 模型打分 |
| `rule_hit` | ARRAY<STRING> | 命中的规则 ID 列表 |
| `final_decision` | STRING | PASS / REVIEW / REJECT |
| `latency_ms` | INT | 端到端耗时 |
| `feature_version` | INT | 特征快照版本 |
| `model_version` | STRING | 模型版本(commit_id) |
| `decided_at` | TIMESTAMP | |

## 六、ETL 与实时决策链路

### 1. 特征加工(Flink)

```sql
-- Kafka 流上计算最近 1 小时行为次数
INSERT INTO redis_feature_source
SELECT user_id,
       COUNT(*) AS apply_cnt_1h,
       COUNT(DISTINCT device_id) AS device_cnt_1h,
       MAX(amount) AS max_apply_amt_1h,
       MAX(event_type) AS last_event_type
FROM kafka.risksource_behavior_event
WHERE event_type IN ('APPLY','LOGIN')
GROUP BY HOP(server_ts, INTERVAL '5' MINUTE, INTERVAL '1' HOUR), user_id;
```

### 2. 模型推理(TF Serving)

```python
payload = {
  "user_id": user_id,
  "feature_snapshot": redis_client.get_features(user_id, version=current_version()),
  "context": {"channel": channel, "device_fp": device_fp}
}
resp = tf_serving.grpc.infer("anti_fraud/v3", payload)
```

### 3. 决策引擎(Liteflow)

```java
RuleDecision decision = ruleEngine.eval(userCtx, ruleSets)
    .onPass(decision -> decision.mark("rules_clean"))
    .onReview(reason -> ruleEngine.recordReviewReason(reason))
    .onReject(decision -> auditLog.write(decision));

if (decision.isReview()) {
  double score = modelClient.score(userCtx);
  decision.resolveByScore(score, thresholdByRegion);
}
```

## 七、特征回溯与模型回放

一次回溯任务通常包括:

1. 从事件存储中按 `user_id + dt 范围` 抽取原事件;
2. 把事件重放到对应特征 job,生成当时点的特征快照(写入 TiKV);
3. 拉取该时间点已上线的模型版本(Feast 记录),批量推理,生成"当时如果上线新模型会怎样"的数据集;
4. 把该数据写入 Iceberg,用于回溯评估与 A/B 决策。

```
event_history → Flink replay → Feature snapshot (TiKV)
                                │
                                ▼
                       Model inference (历史版本)
                                │
                                ▼
                       回溯评估 + Kafka Audit
```

## 八、生产事故:凌晨跨界多头借贷漏判风暴

### 1. 现象

2025 年 12 月 18 日 03:21—04:45,反欺诈系统多次出现"跨平台多头借贷 Score < 阈值,模型放行,但征信接口事后数据证明这是 280 万的团伙行为,损失 1200 万+。

### 2. 定位

| 时间 | 排查项 | 发现 |
|-----|-------|------|
| 03:30 | 模型分数 | 多头借贷模型分数都在阈值线下 |
| 03:45 | 规则集 | R221 规则触发率从 1.2% 突降至 0.4% |
| 04:00 | 特征版本 | Redis 端 `multi_loan_score` 字段值大量为 0 |
| 04:15 | 第三方接口 | 03:21 起 partner API 返回 5xx,导致补偿逻辑失效 |
| 04:30 | Flink checkpoint | 第三份 partner topic 出现 lag 22 min |
| 04:45 | Rule 工作流 | Liteflow 加载到 R221 时加载失败,fallback 到 R220(更宽松) |

**根因**:
1. Partner 平台(三方征信之一)在 03:21 出现抖动,大量 5xx;
2. 我们的回放链路是把 partner 失败事件推到 dead-letter(Kafka DLQ),但没有立即重试,DLQ 消费 lag 22 分钟;
3. 同期模型特征版本号为老版本,**离线新版本特征未生效**;
4. 规则集 R221 在 liteflow DSL 发布时,因表达式非法,被回滚至 fallback R220,放行力度扩大。

### 3. 处理

1. **Pause 决策**:暂停 R220 全量放行,临时启用人工 review(影响 5% 单量);
2. **DLQ 强制重放**:Flink 启动 `dedicated job` 对 DLQ 重读,把结果回灌到 partner topic;
3. **回滚规则**:回滚到 R221,R220 仅对 IP 维度启用;
4. **特征补齐**:Redis 端 `multi_loan_score` 在 04:30 重新计算后,模型分数从 0.20 跳到 0.72;
5. **复盘报告**:事后定级为 Critical,涉及规则上线流程和 partner SLA 两项整改。

### 4. 复盘与改进

- 规则发布加入 `canary`(按 1% → 10% → 50% → 100%),并对 fallback 路径加重试;
- DLQ 加强监控:lag > 1 分钟报警;
- 与 partner 签定 SLA:5xx 不应超过 0.5%,违约引入 doubling 重试;
- 引入"规则幂等 + 特征版本双向校验",降低漏判。

## 九、面试问题

1. **"线上线下特征一致性怎么保证?"** — 共享同一份 Redis 服务 + 同一份 SQL,离线用 Iceberg 通过 Feast 拉版本号;若不一致,以**线上版本**为准,训练时强制 lock 特征版本与模型版本对齐。
2. **"反欺诈延迟为什么必须 ≤ 50ms?"** — 信贷产品用户体验 + 风控拦截前移。P99 50ms 是一线判断门槛,突破就要走异步审核,业务量翻倍。
3. **"Redis 不可用时,风控怎么降级?"** — 三级降级:Level 1=Redis 缓存降级,只读模型特征;Level 2=服务降级,人工审核;Level 3=纯规则模式,关闭模型。SOP 要求每年至少 4 次演练。
4. **"如何做特征回放?"** — Flink replay job 从事件存储重放 + 拉取当时点模型版本,推理后写入 Iceberg;Feast 提供 snapshot API,拉指定时间点特征。
5. **"特征漂移怎么发现?"** — PSI(预测分数稳定性)+ KS(分数分布)+ 跨用户分位数;同时业务侧"被拒绝率"、"人工复议率"做漏斗监控。
6. **"GDPR 遗忘权怎么实施?"** — 1 小时内:Redis 端全删 + Iceberg 端通过 row-level delete 同步删除 + Audit Log 标记。要求每张主表都对 user_id 加 Bloom 索引。

## 十、关键启示

- 实时风控的关键不在"快",而在"稳定",任何一个 batch 模式被用来做兜底都不为过;
- 特征平台是核心资产,Feature Store 不只是基础设施,更是**版本治理**的工具;
- 在金融场景,**容错 > 效率**,任何业务连续性事件都要预案,演练是 KPI 而非口号。

> **结论**:金融风控数仓是把"实时"做到极致的工程题:毫秒级延迟 + 强一致性 + 可解释 + 可审计。Flink + Redis + Iceberg + Feast + TF Serving 的组合,既能扛住 12 万 QPS,也能在模型漂移时回溯 90 天数据。架构的"安全性"远重于"先进性",每一次上线/变更都需要可灰度、可回滚。