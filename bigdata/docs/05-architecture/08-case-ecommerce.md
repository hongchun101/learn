# 案例:电商实时数仓(Flink + Iceberg + Paimon + StarRocks)

## 一、项目背景与规模

- **业务形态**:综合电商平台,涵盖实物商品 + 直播 + 海淘,业务入驻商家超过 60 万;
- **用户规模**:DAU 2300 万,峰值 4500 万;日订单 600—800 万,大促峰值 4000 万单/天;
- **数据规模**:每天 18TB 增量数据,CDC + 行为日志 + 交易日志 + 维度表,合计入仓数据 30+ Iceberg 域;
- **业务痛点**:T+1 报表在 0 点后才出,凌晨运营拿不到前一日数据;实时大屏依赖 Storm 老链路,有 5 分钟延迟;订单主表写入 HBase 后分析侧出不了"近 30 天用户分层",被迫每天导出到 Hive 数仓。

## 二、目标设定

1. **分钟级实时大屏**(销售、流量、风控三个域);
2. **端到端 P99 延迟 ≤ 30 秒**;
3. **流批口径一致** — 实时看板数字与每日离线报表偏差 ≤ 0.5%;
4. **支持 30 天回刷**(补数据、补字段、退款重算等);
5. **可演进** — 新接入业务只需新建 DWD,不影响主链路。

## 三、技术选型理由

| 组件 | 选型 | 关键理由 |
|-----|------|----------|
| 数据采集 | Kafka 3.x + Logback TCP Appender | 多业务语言共享,Kafka Connect 接入上游数据库 |
| 流处理 | Flink 1.18 + Flink CDC | 已经被验证高吞吐,Primary Key + Upsert API 与 Paimon 配套 |
| 主仓表格式 | Paimon(主键表)+ Iceberg(宽表) | 订单主表使用 Paimon 走 upsert,日志类使用 Iceberg append-only |
| 查询引擎 | StarRocks 3.x(实时)+ Trino(批分析) | StarRocks P99 < 1s,Trino 跑回刷与 T+1 分析 |
| Catalog | Iceberg REST + StarRocks External Catalog | 多团队共享 |
| 调度 | Apache DolphinScheduler 3.x | 灵活 DAG,支持 task 复用 |
| 监控 | Prometheus + Grafana + OpenLineage | 端到端追踪 |

## 四、整体架构

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ MySQL / TiDB     │ │ Kafka            │ │ Behavior Track SDK │
└─────────┬────────┘ └─────────┬────────┘ └─────────┬────────┘
          │ Debezium           │ 直接接入          │ 直接接入
          └──────────┬─────────┴────┬────────┘
                     ▼              ▼
              Kafka(cdc_orders、 behavior、 topic)
                     │
        ┌────────────┴─────────────────┐
        ▼            ▼            ▼   (Flink Job)
   Flink CDC    Flink Joiner   Flink PaimonWriter
        │            │            │
        ▼            ▼            ▼
    Paimon主键表  Iceberg宽表   Paimon / Iceberg
                          │
                          ▼
        ┌───────── DWD/DWS/ADS 分层 ─────────┐
        │                                     │
        ▼                                     ▼
  StarRocks(实时看板)                  Trino(T+1 + 回刷)
```

## 五、Topic 与表结构

### 1. Kafka Topic:`cdc.orders`

数据库 binlog(Flink CDC 读取后入 Kafka),schema 由 Schema Registry(Apicurio)管理。

```json
{
  "namespace": "ecom.cdc",
  "name": "orders",
  "type": "record",
  "fields": [
    {"name": "order_id", "type": "string"},
    {"name": "user_id", "type": "string"},
    {"name": "merchant_id", "type": "string"},
    {"name": "total_amount", "type": "double"},
    {"name": "discount_amount", "type": "double"},
    {"name": "pay_amount", "type": "double"},
    {"name": "status", "type": {"type": "enum", "symbols": ["NEW","PAID","CANCEL","REFUND"]}},
    {"name": "created_at", "type": "long", "logicalType": "timestamp-millis"},
    {"name": "updated_at", "type": "long", "logicalType": "timestamp-millis"},
    {"name": "source_db", "type": "string"},
    {"name": "source_table", "type": "string"}
  ]
}
```

### 2. Kafka Topic:`ods.user.behavior`

移动端/前端 SDK 上报,埋点统一规范。

```json
{
  "fields": [
    {"name": "event_id", "type": "string"},
    {"name": "user_id", "type": ["null", "string"]},
    {"name": "session_id", "type": "string"},
    {"name": "event_type", "type": {"type": "enum", "symbols": ["PV","CLK","CART","FAV","EXP"]}},
    {"name": "sku_id", "type": ["null", "string"]},
    {"name": "merchant_id", "type": ["null", "string"]},
    {"name": "channel", "type": "string"},
    {"name": "device_id", "type": "string"},
    {"name": "client_ts", "type": "long", "logicalType": "timestamp-millis"},
    {"name": "server_ts", "type": "long", "logicalType": "timestamp-millis"},
    {"name": "properties", "type": ["null", "string"]}
  ]
}
```

### 3. Paimon 主键表:`dwd.dwd_trade_order`

实时主数据层,落 Paimon Primary Key 表,字段最少但更新频繁。

| 字段 | 类型 | 说明 |
|-----|------|------|
| `order_id` | STRING PK | 业务主键 |
| `user_id` | STRING | |
| `merchant_id` | STRING | |
| `status` | STRING | 状态机 |
| `total_amount` | DECIMAL(18,2) | |
| `pay_amount` | DECIMAL(18,2) | |
| `pay_time` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `dt` | STRING | yyyy-MM-dd 分区 |

### 4. Iceberg 宽表:`dws.dws_user_action_day`

T+1 用,每日按 SKU + 用户聚合。

| 字段 | 类型 | 说明 |
|-----|------|------|
| `user_id` | STRING | |
| `dt` | DATE | |
| `pv_cnt` | INT | 浏览次数 |
| `cart_cnt` | INT | 加购次数 |
| `pay_cnt` | INT | 支付订单数 |
| `pay_amount` | DECIMAL(18,2) | |
| `refund_cnt` | INT | 退款单数 |
| `refund_amount` | DECIMAL(18,2) | |
| `fav_merchant_cnt` | INT | 关注商家数 |
| `last_active_at` | TIMESTAMP | |

### 5. StarRocks 聚合表:`ads.ads_realtime_dashboard`

面向看板(最终用户是大促指挥室):

```sql
CREATE TABLE ads_realtime_dashboard (
  dt        DATE         NOT NULL,
  hh        TINYINT      NOT NULL,
  channel   VARCHAR(32)  NOT NULL,
  gmv       DECIMAL(18,2) SUM,
  order_cnt BIGINT       SUM,
  pay_uv    BIGINT       HLL_UNION,
  sku_uv    BIGINT       HLL_UNION
) ENGINE=OLAP
AGGREGATE KEY(dt, hh, channel)
DISTRIBUTED BY HASH(channel);
```

## 六、ETL 与指标链路

### 1. DWD 生成(Flink Paimon)

```sql
INSERT INTO paimon_catalog.dwd.dwd_trade_order
SELECT  order_id,
        user_id,
        merchant_id,
        status,
        total_amount,
        pay_amount,
        CASE WHEN status IN ('PAID','REFUND') THEN pay_time END AS pay_time,
        created_at,
        updated_at,
        CAST(updated_at AS DATE) AS dt
FROM kafka.cdc_orders
WHERE op <> 'd';
```

### 2. DWS 拼接(Iceberg)

用 Flink 在 5 分钟微批 + 凌晨批跑一次,写到 Iceberg:

```sql
INSERT INTO iceberg_catalog.dws.dws_user_action_day
SELECT  user_id,
        CAST(MAX(server_ts) AS DATE) AS dt,
        COUNT_IF(event_type = 'PV') AS pv_cnt,
        COUNT_IF(event_type = 'CART') AS cart_cnt,
        SUM(CASE WHEN pay_amount IS NOT NULL THEN 1 ELSE 0 END) AS pay_cnt,
        SUM(pay_amount) AS pay_amount,
        SUM(is_refund) AS refund_cnt,
        SUM(refund_amount) AS refund_amount,
        COUNT(DISTINCT merchant_id FILTER(WHERE event_type = 'FAV')) AS fav_merchant_cnt,
        MAX(server_ts) AS last_active_at
FROM kafka.ods_user_behavior
GROUP BY user_id;
```

### 3. ADS 看板(StarRocks)

StarRocks 接 Kafka + Iceberg 两路,实时 GMV 入 Kafka 即可,T+1 数字回填 Iceberg。

```sql
SELECT dt, hh, channel,
       SUM(gmv) AS gmv,
       SUM(order_cnt) AS order_cnt,
       HLL_CARDINALITY(SUM_DISTINCT(pay_uv)) AS pay_uv
FROM ads_realtime_dashboard
WHERE dt >= CURRENT_DATE - INTERVAL '7' DAY
GROUP BY dt, hh, channel;
```

## 七、回刷流程

业务经常出现"补数、退款重算、状态机修正"的需求。

1. **触发回刷**:通过数据治理平台发出工单,指定 partition 区间 + 重算日期;
2. **停流**:把 Flink 对应 job 切到"只读不写",下游消费回补完成;
3. **批模式重跑**:Spark 启动 Iceberg `rollback_to_snapshot` 至昨日版本,重跑 DWS SQL;
4. **重写 Paimon**:Flink 从 Kafka cdc_orders 重读,在 Paimon 表上执行 `INSERT OVERWRITE` 指定 partition;
5. **质检**:用 Great Expectations 对该分区跑完整性 + 准确性 + 一致性三种规则;
6. **切流恢复**:StarRocks 切断回刷链路,接入实时链路。

## 八、生产事故:大促凌晨 Paimon 小文件雪崩

### 1. 现象

2025 年 11 月 11 日 00:15,Dashboard 显示实时 GMV 与离线 GMV 偏差突然飙升,从 0.3% 到 12%,告警系统开始连发"Paimon read latency"超时。

### 2. 定位

1. **告警信息**:`Paimon manifest_list size > 10MB,read latency p99 = 12s`;
2. **堆栈分析**:通过 Flink Web UI,看到 compaction 节点 GC pause 长达 5s;
3. **触发原因**:大促期间 Flink 在 Kafka 流量增加 7 倍,Paimon 的写入并发由 16 提升到 64,但 compaction 内置参数未同步提升;
4. **根因**:单作业 compaction 完成后生成的小 file 数超出 Paimon 默认阈值,导致 manifest 数量爆涨,下游 StarRocks 读 Iceberg 计划阶段阻塞;
5. **副作用**:StarRocks 端 query plan 单次 list-file 调用 12 秒,数据才能出。

### 3. 处理

- **第一波(0:20)**:手动触发 `CALL sys.compact_table('dwd.dwd_trade_order')` 紧急合并;
- **第二波(0:30)**:调参 `bucket = 64`、`compaction.min-file-num = 4`,缩容 file 大小到 128MB 上下;
- **第三波(1:00)**:重启 Flink,改写 compaction 算子,**Prometheus 上 P99 降至 1.5s**;
- **第四波(次日)**:把 compaction 改为 `dedicated job`(独立 Flink job),不再与写入主 job 抢资源。

### 4. 复盘与改进

- 加 **自动 compaction 任务**:基于小文件计数 + 延迟阈值自动触发;
- 监控加 **manifest_size 指标**,超过 8MB 即报警;
- 写一个 `chaos_drill.py`,每月模拟流量 × 5 进行压测;
- 团队沉淀 SOP:Paimon compaction 经验纳入"实时链路手册"。

## 九、面试问题(5 个高频)

1. **"为什么 Paimon 和 Iceberg 一起用,而不是只用一种?"** — Paimon 强在 upsert/side 改动,订单/状态用 Paimon;行为日志只追加 / 全量重写,用 Iceberg。把两者混在一起,各自做最擅长的事。
2. **"流批口径怎么保证一致?"** — Producer 是同一个 Kafka topic;ETL 算子 90% 共享;落地到 StarRocks 后,实时与离线只是 partition 不同,业务消费时是 `UNION ALL` 后聚合。
3. **"Paimon 小文件问题怎么治理?"** — 三个手段:写入侧启用 bucket + min-file-num,compaction 单独 job 化,监控 manifest 文件数与 manifest-list size。生产中 Paimon 的 manifest-list 应该控制在 8MB 以下。
4. **"回刷时如何保证业务不感知?"** — 切流优先 + 校验 + 切回,Spark 跑回刷,Flink 的实时链路"只读不写",完成后用 `ALTER TABLE ... SWITCH PARTITION` 把 StarRocks 切到新 partition。这套动作保证用户侧毫秒级感知不到数据切换。
5. **"大促当晚扩缩容怎么做?"** — 提前 3 天扩容 Kafka topic partition;Flink 用 Reactive Mode + 自适应并发;Paimon 的 bucket 在压测时就拉到 256,大促时不用再扩,直接复用。

## 十、收尾与启示

- 本案例最关键的工程经验是**"实时写入 + 异步 compaction + 监控切片"**,三者缺一不可;
- 数据模型与字段命名规范是治理的根基,但落地靠 **CDC + Schema Registry + 字段血缘** 串起来;
- 真正"流批一体"的代价不只是引入 Paimon,而是工程上完成思路转换:写 ETL 时不假设"批"或"流",而是把语义时间(`event_time`)与处理时间(`proc_time`)分开。

> **结论**:电商实时数仓之所以复杂,正是因为它要在三个时延尺度同时稳——秒级看板、分钟级风控、日级财报。Flink + Paimon + Iceberg + StarRocks 的组合在 2024 年的工程实操中,被证明能扛住日增 18TB + 4 千万订单的实战。