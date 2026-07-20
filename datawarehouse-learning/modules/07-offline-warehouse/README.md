# 模块 07 — 离线数仓（ODS / DWD / DWS / DWT / ADS）


> 一站式离线数据仓库分层实战：基于电商订单、订单明细、商品、用户、用户行为五张原始表，完整跑通 **ODS → DWD → DWS → DWT → ADS** 五层链路，并在每一层之间落地可被自动化测试验证的"业务契约"。本模块以 DuckDB 作为参考执行引擎（其他引擎 Hive / Spark / Trino 复用同一份 SQL 契约），所有示例均能在单机 DuckDB 内跑完，方便本地调试。配套 6 个 pytest 用例覆盖跨层 GMV 契约、SCD-2 双版本、分区裁剪、DWS 行数对齐等关键不变量，作为分层架构正确性的"实时体检报告"。本模块的目标读者是已经写过一段时间 SQL、但还没有完整做过一个分层数仓项目的工程师；读完 ch01~ch08 之后，你应当能在自己的业务里独立搭出 ODS→ADS 五层架构，并能用本模块这套测试框架守护分层契约不被后续迭代悄悄破坏。

## ch01 分层架构

数仓分层不是为了"显得专业"，而是把一类副作用隔离在一层里：**ODS 解决"原始数据如何沉淀"的问题，DWD 解决"数据脏不脏、口径统不统一"的问题，DWS 解决"按主题看一天怎么样"的问题，DWT 解决"看一个用户/商品的全生命周期"的问题，ADS 解决"今天 GMV 多少、DAU 多少的问题"**。每一层只对相邻的下一层暴露接口，越往下越接近原始事实，越往上越接近业务指标。这样做有三个直接收益：第一，新人入职能很快知道去哪一层找数据；第二，上游脏数据不会污染下游报表；第三，每个 BI 报表背后都能追溯到一行明确的 DWS / DWT 计算逻辑，出了问题能 5 分钟内定位是哪一层算错了。

| 层级 | 中文名 | 粒度 | 典型表 | 主要消费者 | 重跑频率 |
|------|--------|------|--------|------------|----------|
| ODS  | 贴源层 | 与源系统一致 | `ods.orders`, `ods.order_items` | DWD | T+0 增量 |
| DWD  | 明细层 | 一行=一笔业务事件 | `dwd.dwd_orders`, `dwd.dim_user_scd2` | DWS / DWT | T+1 全量/增量 |
| DWS  | 汇总层 | 一行=一天一主题 | `dws.dws_user_order_day` | DWT / ADS | T+1 滚动 |
| DWT  | 主题层 | 一行=一主题全量 | `dwt.dwt_user_lifecycle` | ADS | T+1 全量 |
| ADS  | 应用层 | 一行=一指标/一报表 | `ads.ads_gmv_daily`, `ads.ads_overall_kpi` | BI / API | T+1 / 实时 |

**依赖方向严格向下**：ADS 只能消费 DWT/DWS，DWT 只能消费 DWD，绝不允许反向回流；任何上游表结构变更都必须从下往上兼容推进。**口径单一来源**：GMV、活跃用户等核心指标在同一层定义一次，下游全部引用，禁止每张报表自己写一遍 `WHERE status='completed'`。**层级命名一致**：所有表都加层前缀，下游引用时一眼就能看清来自哪一层，避免被同名表混淆。

**为什么一定要分这么多层？** 早期数仓不分层，所有表都堆在 `dwd.*`，结果一张订单表被 100 张报表引用，每张报表都自己写一套 `WHERE` 过滤条件。一天产品经理改了下单状态的取值，从 `cancelled` 改成 `canceled`，结果只有 30 张报表跟着改了，剩下 70 张报表"静默出错"——上层数字看起来波动不大但实际全错了，要等业务方对账时才发现，损失难以估量。分层之后口径收敛在 DWS 一处，状态值变更只需要在 DWS 一处 `LOWER()` 一下，下游 100 张报表全部自动跟着变，零修改。这就是分层的核心价值——**把变动的半径控制在一层之内**。

**分层 vs 不分层的代价对比**：不分层的项目，开发周期短（不用想清楚层级），但维护成本指数级上升——业务方每次改口径都要通知 100 个报表作者；分层的项目，开发周期长（前期要花 30% 时间搭骨架），但维护成本线性可控——口径变更只影响 1 张 DWS 表。规模越大，分层的边际收益越高：日订单量 1 万单时不分层还能撑住，100 万单时不分层就会崩盘。本模块用 DuckDB 演示分层，10 万订单的样本规模足以讲清分层逻辑；切到 Hive / Spark / Doris 之后每一层的实现细节会变（Parquet 分区换成 HDFS 分区目录、物化视图换成 Iceberg hidden partition），但分层契约和命名规范完全一致。

离线数仓的核心是稳定和可解释，每一层都是为了把复杂度收敛到一个明确的边界内。

---

## ch02 ODS 层设计

ODS（Operational Data Store）的唯一职责是**保留原始痕迹**。任何在源端做过的清洗、字段改名、类型转换都不应该在 ODS 出现——一旦做了，下游就再也无法分辨"这是源系统的真实样子"还是"这是 ETL 改过的样子"。ODS 表与源系统的字段、类型、长度都必须 1:1 对齐，遇到 NULL 也要原样保留，遇到 1970 年的脏数据也要原样写入，这是 ODS 的"历史文物"价值。

落地要点：

1. **存储格式**：推荐 Parquet / ORC 列式存储，按 `dt`（业务日期）分区。Hive/Spark 上分区目录形如 `/ods/orders/dt=2024-07-18/`。DuckDB 这套示例里我们直接用 `dt` 列模拟，但语义相同——分区裁剪靠它。
2. **幂等可重跑**：表名固定 `ods.orders`，写操作一律 `INSERT OVERWRITE PARTITION`，ETL 失败可整体重跑当天分区，不需要关心下游幂等。
3. **审计字段**：除源字段外，ODS 还应保留 `etl_time`、`source_system`、`source_file` 三个字段，本模块为了简化省略，但生产中必须有，否则出问题时无法溯源到原始日志。
4. **数据校验**：在 ODS 落地完成后立即跑一条"行数对账"——和源系统 T-1 行数差异超过阈值就告警；跑一条"主键去重"，发现 PK 重复立刻阻断下游。
5. **Schema Evolution**：源系统加字段是常事，ODS 必须能向后兼容——缺失列填 NULL，新增列直接透出，绝不允许因为 schema 变更导致下游 ETL 失败。
6. **冷热分层**：超过 180 天的 ODS 分区可以归档到对象存储（S3/OSS）的冷存储层，配合生命周期规则自动删除。Hive 上的 `EXTERNAL TABLE` 配合分区路径直接指向冷存储对象即可，查询时仍可透明访问。
7. **数据延迟 SLA**：ODS 落地必须有时效性承诺。订单 ODS 一般要求 T+0 5 分钟内全部落库，超过 30 分钟告警——因为下游 DWD 是 T+1 全量重做，如果 ODS 数据延迟到第二天上午，整个数仓就会全线延期。

SQL 实现：

```sql
CREATE OR REPLACE TABLE ods.orders_part AS
SELECT order_id, user_id, total, status, order_date, order_ts,
       CAST(order_ts AS DATE) AS dt,
       EXTRACT('year'  FROM order_ts)::INT AS dt_year,
       EXTRACT('month' FROM order_ts)::INT AS dt_month
FROM ods.orders;
```

注意我们把 `dt` 派生列显式建出来，而不是让下游自行 `CAST(order_ts AS DATE)`——这样所有下游都能用同一个列名做分区裁剪，避免出现"有些表叫 `dt`、有些表叫 `dt_date`、有些表叫 `p_date`"的混乱。`dt_year` / `dt_month` 也是冗余派生字段，目的是让 ADS 端可以直接用 `WHERE dt_year = 2024 AND dt_month = 7` 做分区裁剪，避免调用 `EXTRACT()` 函数导致执行引擎放弃分区索引。

**ODS 的"不做清洗"边界**：ODS 不是不做任何处理，它至少做三件事——(1) **统一字符集**：源系统 MySQL 用 utf8mb4、PostgreSQL 用 UTF-8、日志文件用 GBK，ODS 统一落到 UTF-8 的 Parquet，避免下游处理乱码；(2) **统一时间格式**：源系统时间戳可能是字符串、数值、DateTime，ODS 统一到 TIMESTAMP 类型；(3) **添加 `dt` 派生列**：源系统未必带业务日期，但 ODS 必须有 `dt`，这是后续所有分区的依据。除了这三件事之外，ODS 不动任何业务字段——业务字段一旦在源端变化，ODS 必须立刻察觉并报警。

---

## ch03 DWD 层清洗

DWD 是数仓的"主战场"——80% 的脏数据治理工作发生在这里。DWD 表是**不可变事实**，每条记录代表一笔已经发生且不可撤回的业务事件，业务方对 DWD 表的访问权限一般要求高于 ODS，但低于 DWS/DWT——DWD 是数仓的"事实标准"。一旦 DWD 表被业务方引用，schema 就很难改了——所有修改必须向后兼容，新增列可以，删除列或改语义不行。

清洗步骤按顺序执行：

1. **去空**：主键、`order_amount`、外键不允许 NULL。源系统偶发的 NULL 主键直接丢弃，不进入 DWD。
2. **去重**：同一 `order_id` 出现多次只保留最早一条。可以用 `ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY etl_time)` 排序后取 `rn=1`。如果发现去重率超过 1%，就要回查源系统是不是有重试 bug。
3. **标准化**：状态字段 `LOWER(TRIM(status))`，金额字段统一到 `DOUBLE`，日期统一到 `DATE` / `TIMESTAMP`。命名也要标准化——所有"金额"统一叫 `amount` 或 `gmv`，所有"时间戳"统一叫 `ts`，所有"日期分区"统一叫 `dt`。
4. **范围校验**：`quantity > 0`，`unit_price >= 0`，`age BETWEEN 0 AND 150`。违规数据进入 `dwd.dwd_quarantine` 而不是直接丢弃，方便事后分析源系统 bug。
5. **维度关联**：通过外键 `user_id` 关联到 `dim_user_scd2`，从而获得下单当时该用户的等级——这是 **SCD-2** 的核心价值。

SCD-2（Type-2 Slowly Changing Dimension）用来回答"**当时**这个用户的等级是什么"。我们用 `effective_from / effective_to / is_current` 三列记录一段有效区间，示例中假设偶数 `user_id` 的用户在 2024-07-01 升级了一次，于是这条用户存在两行版本：一份记录 2024-06-30 之前的 silver 状态，一份记录 2024-07-01 之后的新等级状态。两份记录的 `effective_from` / `effective_to` 严格不重叠，`is_current` 标记当前生效的那一行。


```sql
CREATE OR REPLACE TABLE dwd.dim_user_scd2 AS
WITH base AS (
    SELECT user_id, user_name, level, register_date, age, gender,
           register_date AS effective_from,
           CAST('9999-12-31' AS DATE) AS effective_to,
           TRUE AS is_current
    FROM ods.users
),
split AS (
    SELECT user_id, user_name, level, register_date, age, gender,
           effective_from, effective_to, is_current
    FROM base WHERE user_id % 2 = 1
    UNION ALL
    SELECT user_id, user_name, level, register_date, age, gender,
           register_date AS effective_from,
           CAST('2024-06-30' AS DATE) AS effective_to,
           FALSE AS is_current
    FROM ods.users WHERE user_id % 2 = 0
    UNION ALL
    SELECT user_id, user_name,
           CASE level WHEN 'silver' THEN 'gold' WHEN 'gold' THEN 'platinum' ELSE level END,
           register_date, age, gender,
           CAST('2024-07-01' AS DATE) AS effective_from,
           CAST('9999-12-31' AS DATE) AS effective_to,
           TRUE AS is_current
    FROM ods.users WHERE user_id % 2 = 0
)
SELECT ROW_NUMBER() OVER (ORDER BY user_id, effective_from) AS user_sk,
       user_id, user_name, level, register_date, age, gender,
       effective_from, effective_to, is_current
FROM split;
SELECT user_id, level, effective_from, effective_to, is_current
FROM dwd.dim_user_scd2 WHERE user_id = 2 ORDER BY effective_from;
```

使用 SCD-2 时通过时间点关联：`JOIN dim_user_scd2 d ON d.user_id = o.user_id AND o.order_ts >= d.effective_from AND o.order_ts < d.effective_to`。这样在 7 月 1 日前下单的订单会命中旧版本（silver），之后命中新版本（gold）。如果直接 `JOIN ON d.user_id = o.user_id`，一对多会爆炸，报表结果完全是错的。

**SCD-2 的代价**：每个维度的每一版本都占一行，存储会膨胀。100 万用户平均变更 3 次等级 → dim_user_scd2 有 400 万行。所以一般维度表只对"会随时间变化的属性"做 SCD-2，对"基本不变的属性"（性别、出生年月）保持 SCD-1（只保留当前最新值）。生产上还会定期归档旧版本到冷存储，避免热数据无限膨胀。

---

## ch04 DWS 层汇总

DWS（Data Warehouse Summary）面向**轻度汇总**：一行 = 一天 × 一个主题 × 一个维度键。例如 "2024-07-18 用户 244 的下单情况"。它是 90% 的 ADS 报表的数据源，把上亿行的 DWD 压缩成百万行的 DWS 后，所有上层查询都能从分钟级降到秒级。Hive 上的 DWS 表通常按 `dt` 分区、按主题做 bucket，方便单日范围内的随机访问。

设计原则：

- **粒度稳定**：一旦选定 `(dt, user_id)` 就不要混进 `(dt, user_id, product_id)` 这种更细的粒度；需要更细就新建一张 DWS 表，不要让一张表承担两种粒度，否则下游极易写错 GROUP BY 出现重复行。
- **命名规范**：`dws_<domain>_<subject>_<period>`，例如 `dws_user_order_day`、`dws_user_event_day`。下划线分段让长表名一眼能看清层级。
- **空值零值要分开处理**：`COUNT(*)` 计所有事件，`COUNT(order_id)` 只计有下单的事件，两者之差就是"逛了没买"。这个区分在做漏斗分析时尤其重要。
- **口径字段加注释**：每个金额字段必须配一段 SQL 注释说明它由哪些 DWD 字段聚合得到，防止后人改 WHERE 条件破坏 GMV 契约。
- **分区字段冗余**：除了 `dt`，冗余一份 `dt_year` / `dt_month`，避免 ADS 端做 `EXTRACT(year FROM dt)` 这种函数调用打断分区裁剪。
- **窄表而非宽表**：一张 DWS 表只描述一个主题的一个角度，不要把所有维度都拼上去。"宽表诱惑"是 DWS 最常见的反模式——最后变成"什么字段都查得到，但扫描性能惨不忍睹"。

实现：

```sql
CREATE OR REPLACE TABLE dws.dws_user_order_day AS
SELECT dt, user_id, dt_year, dt_month,
       COUNT(*) AS order_cnt,
       SUM(CASE WHEN order_status = 'completed' THEN order_amount ELSE 0 END) AS gmv_completed,
       SUM(CASE WHEN order_status = 'created'   THEN order_amount ELSE 0 END) AS gmv_created,
       SUM(CASE WHEN order_status <> 'cancelled' THEN order_amount ELSE 0 END) AS gmv_net,
       SUM(CASE WHEN order_status = 'cancelled' THEN order_amount ELSE 0 END) AS gmv_cancelled
FROM dwd.dwd_orders
GROUP BY dt, user_id, dt_year, dt_month;
SELECT * FROM dws.dws_user_order_day WHERE user_id = 244 ORDER BY dt LIMIT 5;
```


**DWS 的漏斗与归因**：DWS 不只是把 DWD 简单求和，它还承担"漏斗建模"和"异动归因"的职责。例如订单漏斗：`dws_user_event_day` 里 `pv_cnt / cart_cnt / pay_cnt / fav_cnt` 四个计数列直接构成一个用户行为漏斗，业务方一眼就能看出哪一步转化率下降。运营大屏常见的"GMV 异动归因面板"也是从 DWS 这一层出发的——`gmv_completed` 和 `gmv_created` 的差值变化、订单数与 GMV 的比值变化、退款率变化，三组维度交叉起来基本能定位 90% 的异动根因。所以 DWS 表设计时一定要多花时间想清楚下游会怎么拆解它——一个字段加对了能省下游三张报表的工作量。
`gmv_net = gmv_completed + gmv_created` 这种关系是 ADS 层做"GMV 异动归因"时直接复用的拆分维度。一旦 GMV 突然下降，业务方第一句话就是"是 completed 跌了还是 created 跌了？"，DWS 这一层就提前埋好了归因字段。

**DWS 的滚动窗口 vs 全量重写**：当天分区 `dt='${date}'` 用增量 `INSERT OVERWRITE PARTITION`，历史分区保持不变。这种"小窗口增量 + 大窗口稳定"的策略让 DWS 表既支持当天实时查询，也支持任意一天的历史回溯（数据回滚 7 天内的某个分区）。`gmv_cancelled` 这种"负向"指标也要保留，因为有时候 GMV 上升是因为取消率下降，净 GMV 不变但拆开看两个数都在动。

---

## ch05 DWT 层累积

DWT（Data Warehouse Topic）面向**累积快照**：一行 = 一个主题对象（用户/商品/商家）跨越全部历史的最终状态。和 DWS 的滚动窗口不同，DWT 是**单条记录生命周期内的全部事实**，因此它的体量约等于主题对象数（一千万用户 = 一千万行），非常适合作为"长期画像 / 终身价值"查询的事实源。Hive 上的 DWT 表通常按主题 ID 做 bucket，方便单用户范围的全量查询。

常见主题：

- `dwt_user_lifecycle`：每个用户从注册到当前的全部下单汇总、首次下单、末次下单、累计 GMV、累计订单数、最近一次下单距今天数。
- `dwt_product_lifecycle`：每个 SKU 的累计销量、累计销售额、退款率、差评率、上架天数。
- `dwt_merchant_lifecycle`：每个商家日活订单、累计 GMV、上架商品数、DSR 综合评分。

重跑策略：DWT 表通常 T+1 全量重写，因为它是下游 ADS 的强依赖，重写比增量修复要可靠得多——如果增量漏掉一条变更，下游 ADS 就永久带错，全量重写则只需担心当天的成功。Hive/Spark 上配合 `INSERT OVERWRITE TABLE dwt_user_lifecycle PARTITION (dt='${date}')` 即可；本模块用 DuckDB `CREATE OR REPLACE TABLE` 等价表达。

```sql
CREATE OR REPLACE TABLE dwt.dwt_user_lifecycle AS
SELECT user_id,
       COUNT(*) AS lifetime_order_cnt,
       SUM(CASE WHEN order_status = 'completed' THEN order_amount ELSE 0 END) AS lifetime_gmv_completed,
       SUM(CASE WHEN order_status <> 'cancelled' THEN order_amount ELSE 0 END) AS lifetime_gmv_net,
       MIN(dt) AS first_order_dt,
       MAX(dt) AS last_order_dt
FROM dwd.dwd_orders
GROUP BY user_id;
SELECT * FROM dwt.dwt_user_lifecycle WHERE user_id = 244;

**DWT 的"沉默用户"识别**：`dwt_user_lifecycle` 还能配合 `CURRENT_DATE - last_order_dt` 计算出"多少天未下单"，再结合业务定义的沉默阈值（一般是 90 天）就能识别出沉默用户。运营做"流失召回"时直接 `WHERE CURRENT_DATE - last_order_dt > 90 AND lifetime_gmv_net > 1000` 就能筛出"高价值流失用户"——这就是 DWT 累积快照表的核心业务价值。没有 DWT，这些指标每次都要从 DWD 全表扫一遍，亿级订单表上的留存计算可能跑半小时。
```

注意 `MIN(dt) / MAX(dt)` 必须落在 `dt` 列上而不是 `order_ts`——同一用户同一天可能下多笔单，要的是"首次下单日期"，不是"首次下单时间戳"。同理 `lifetime_order_cnt` 用 `COUNT(*)` 计所有订单，不应该再用任何过滤，否则就会把"取消但退款成功"的订单漏掉，影响 GMV 准确性。

**DWT 的 T+1 全量重写策略**有讲究：当用户量达到千万级时，全量重写一次 `dwt_user_lifecycle` 需要扫全表所有 DWD 数据，可能耗时数小时。优化方向包括：(1) 增量合并——只重写近 30 天有活跃的用户；(2) 物化视图——把 `dwt_user_lifecycle` 建为 `dwd.dwd_orders` 上的物化视图，引擎自动维护；(3) 分桶重写——按 user_id hash 分桶，每个分桶独立重写，部分桶失败不会拖累整体。本模块为了演示清晰使用全量重写，生产环境建议上方案 (1) 或 (3)。

---

## ch06 ADS 层应用

ADS 是**对外窗口**：报表、API、自助 BI、运营大屏全部从 ADS 取数。它是数仓唯一被业务直接感知的层，所以 ADS 的代码质量、口径注释、SLA 监控要做到最严格。ADS 表的任何 schema 变更都意味着 BI 报表 / API 的版本升级，必须提前公告下游。

三类常见 ADS 表：

1. **日指标宽表** `ads_gmv_daily`：一行 = 一天的全站 GMV / 订单数 / 买家数。BI 大屏首屏直接 SELECT 这张表。
2. **用户画像表** `ads_user_lifetime`：一行 = 一个用户，来自 DWT 的 `lifetime_gmv_net`。运营做"高价值用户召回"时直接拉这张表。
3. **业务大屏表** `ads_overall_kpi`：单行总览卡片，BI 大屏首屏直接 SELECT *，避免每次都 SUM 一次。

ADS 写法的两条铁律：

- **所有金额口径必须显式写出来**：`SUM(gmv)` 比 `SUM(total)` 安全——前者已经是被定义好的口径，后者依赖 DWS/DWT 列名稳定。
- **所有跨层 GMV 都要做 reconciliation**：DWS SUM = DWT SUM = ADS SUM 是不可妥协的契约，任何一层对不上就要立刻修数据，不能"差不多就行"。本模块的测试 `test_gmv_reconciles_across_layers` 就是这条契约的自动化实现。

```sql
CREATE OR REPLACE TABLE ads.ads_gmv_daily AS
SELECT dt,
       SUM(gmv_net)        AS gmv,
       SUM(gmv_completed)  AS gmv_completed,
       SUM(order_cnt)      AS order_cnt,
       COUNT(DISTINCT user_id) AS buyer_cnt
FROM dws.dws_user_order_day
GROUP BY dt;

CREATE OR REPLACE TABLE ads.ads_user_lifetime AS
SELECT user_id, lifetime_order_cnt,
       lifetime_gmv_net   AS gmv,
       lifetime_gmv_completed AS gmv_completed
FROM dwt.dwt_user_lifecycle;

CREATE OR REPLACE TABLE ads.ads_overall_kpi AS
SELECT (SELECT SUM(gmv)       FROM ads.ads_gmv_daily)     AS total_gmv,
       (SELECT SUM(order_cnt) FROM ads.ads_gmv_daily)     AS total_orders,
       (SELECT SUM(buyer_cnt) FROM ads.ads_gmv_daily)     AS total_buyers,
       (SELECT SUM(gmv)       FROM ads.ads_user_lifetime) AS lifetime_gmv,
       (SELECT COUNT(*)       FROM ads.ads_user_lifetime) AS lifetime_buyers;

**ADS 的 API 化与权限隔离**：ADS 表的另一类典型消费者是数据 API（REST/gRPC）。API 网关接到请求后直接 `SELECT * FROM ads.ads_gmv_daily WHERE dt = ?` 返回 JSON，不需要现场聚合。要保证 API 的 SLA 必须做两件事：(1) **ADS 路由只读账号**——ADS 表的读权限只对 API 网关账号开放，其他账号只能通过 ADS 视图查询，避免下游绕过 ADS 直接打 DWS；(2) **API 查询限流**——单接口 QPS 上限 + 单查询扫描行数上限，超限直接拒绝而不是让执行引擎拖垮整张 ADS 表。
SELECT * FROM ads.ads_overall_kpi;
```

ADS 表还要做的一件隐性工作：**口径文档化**。每一列必须在表注释里写明它的计算 SQL 引用链：`gmv -> dws.gmv_net -> dwd.dwd_orders.order_amount (status<>'cancelled')`。新 BI 工具接入时不会再来问"GMV 怎么算的"。

**ADS 的查询性能保障**：ADS 表的访问频率远高于 DWD/DWS，必须为常用查询模式建索引——Hive 上建 ORC + bloom filter + 排序键；ClickHouse/Doris 上建主键索引 + 二级索引；Trino 上建分区 + bucket。一旦 ADS 表查询超过 SLA（一般 3 秒），就要回查 DWS 的聚合粒度是不是太粗，能不能为这个查询单独做一张更细的 DWS 表。

---

## ch07 维度建模实战

Kimball 维度建模在离线数仓里仍然是事实标准。围绕业务过程识别**事实表**，围绕"谁 / 什么 / 哪里 / 何时"识别**维度表**，事实表通过外键连接维度表。这种建模方式的优势是查询模式稳定——BI 工具生成的 SQL 几乎都能用 star schema 高效执行。

本模块涉及的事实表：

| 事实 | 粒度 | 度量 | 关联维度 |
|------|------|------|----------|
| 下单事实 | 一笔订单一行 | `order_amount`, `order_cnt` | dim_user_scd2, dim_date, dim_status |
| 加购/支付事件 | 一条事件一行 | `event_cnt` | dim_user_scd2, dim_date |
| 订单明细事实 | 一件商品一行 | `gross_amount`, `quantity` | dim_product |

**事实表三大类型**：

- **事务事实表**（本模块的 `dwd_orders`）：一行一笔业务事件，存储稀疏——只有产生事件的当天有数据。增长快，按 `dt` 分区效果最好。事务事实表不能 update，每次状态变化都写入新行，靠下游 SCD-2 关联恢复"当时"语义。
- **周期快照事实表**（`ads_gmv_daily`）：一行一段时间的累计，按天滚动。即使当天没有订单也会有"0 订单"行，避免下游做日活统计时漏掉日期。
- **累积快照事实表**（订单从下单→支付→发货→签收全链路）：一行一个业务对象，多个时间戳字段记录生命周期各阶段。本模块暂未涉及，但可以用同一份订单数据扩展，例如 `dwd.dwd_order_pipeline`，对每个 order_id 记录 `placed_at / paid_at / shipped_at / signed_at`。

**维度建模的反模式**：

1. **大宽表**：把 user 维度的 30 个字段全塞进事实表，结果每次 user 改属性都要更新所有事实行——既贵又破坏 SCD-2 的"当时"语义。
2. **雪花过深**：一个 `dim_city` 下面再挂 `dim_province`，再挂 `dim_country`，JOIN 链 5 层以上，性能崩溃。能合并成一张大宽维度表就合并。
3. **把度量放在维度表里**：`dim_product` 上加一列 `total_sales_qty`——这是事实，不是维度。这样做会让维度失去"不可变"的特性。
4. **多个事实表共享同一个维度但语义不同**：例如 `dim_date` 在订单事实里是 `order_date`，在支付事实里是 `pay_date`——不要为了省事把两个日期混在同一个维度里，否则 JOIN 时出现歧义。

**退化维度（Degenerate Dimension）的取舍**：订单号 `order_id` 这种既不是事实也不是传统维度的字段，可以直接放在事实表里不抽维度——叫"退化维度"。例如本模块的 `dwd.dwd_orders` 直接保留 `order_id`，不需要 `dim_order`。退化维度适合"高频查询但几乎不参与聚合"的字段；如果订单号经常出现在 GROUP BY 中，那还是抽成维度表更清晰。还有一类"枚举型维度"（如 `order_status`），由于取值稳定且只有几个，可以直接 `CASE WHEN status` 在 ADS 层做翻译，不必建 `dim_status` 表——本模块就是这种做法。
5. **维度表不带代理键**：用业务键直接做事实表外键。当源系统 PK 变更（虽然极少发生）时，事实表所有相关行都要改；带代理键 `user_sk` 之后，源 PK 变更只需要改维度表。

SCD-2 是维度建模的灵魂。我们用 `dim_user_scd2` 同时回答两个问题：

- **"现在这个用户什么等级？"** → `WHERE is_current = TRUE`
- **"2024-05-01 这个用户下单时什么等级？"** → 通过 `order_ts` 命中区间

这两种查询在同一张表上共存，避免维护两份维度数据，也避免了"当时等级"问题被丢给业务方自己拼 SQL 解决。

---

## ch08 命名规范与编码

离线数仓是**长期资产**——一段 SQL 三个月后还要有人能看懂。命名规范和编码风格就是降低这一成本的最便宜工具。下面这套规范来自一线数仓团队的多年血泪教训，照做就能少踩 80% 的坑。

**命名规范**：

| 对象 | 规则 | 示例 |
|------|------|------|
| schema | 小写全拼 | `ods`, `dwd`, `dws`, `dwt`, `ads`, `dim`, `tmp` |
| 表 | `<layer>_<domain>_<subject>_<period>` | `dws_user_order_day`, `ads_gmv_daily` |
| 字段 | 小写蛇形，避开保留字 | `order_amount`, `dt`, `user_id` |
| 临时表 | 固定前缀 `tmp_` 并配 `DROP TABLE IF EXISTS` | `tmp_user_active_30d` |
| 主键 | 业务键 `<entity>_id`，代理键 `<entity>_sk` | `user_id` vs `user_sk` |
| 时间戳 | 一律 `_ts` 后缀 | `order_ts`, `pay_ts` |
| 日期分区 | 一律 `dt` | `dt`, `dt_year`, `dt_month` |
| 金额 | 一律 `*_amount` 或 `gmv_*` | `order_amount`, `gmv_net` |
| 状态/类型 | 标准化为小写，逗号分隔值 | `order_status`, `event_type` |

**编码守则**：

1. **每张表写注释头**：作者、目的、源表、上游依赖、更新频率、重跑影响范围。下次有人想改表结构时，看一眼注释就知道会不会炸到 BI。
2. **每个聚合字段配一段 SQL 注释**：写明它由哪些 DWD 字段、什么过滤条件聚合得到。这是 GMV 口径的唯一可信来源。
3. **避免 `SELECT *`**：ADS 层永远是显式列名，否则下游字段顺序一变就崩。DuckDB 虽然支持，但生产 Hive/Spark 上要严守。
4. **CASE WHEN 收敛在同一层**：状态标准化只发生一次（DWD），下游全部引用标准化后的值。`gmv_net` 只在 DWS 层定义一次，ADS / DWT 直接 SELECT，不要在 ADS 重新 `CASE WHEN`。

**数据治理与合规**：离线数仓存储了大量用户行为数据，必须符合《个人信息保护法》《数据安全法》等合规要求。具体落地动作：(1) **敏感字段加密存储**——身份证号、手机号、邮箱在 DWD 层就要 AES 加密，下游 DWS/ADS 只能拿到脱敏后的 `md5(phone)` 或 `phone_mask`；(2) **访问审计**——所有 ADS 表的查询都要走审计日志，记录查询人、查询时间、查询 SQL，保留 180 天以上；(3) **数据生命周期管理**——超过 2 年的用户行为明细要归档或匿名化处理，避免合规风险。这些动作的代码也要写进 ch08 的规范里——它属于"长期资产"维护的一部分。
5. **口径字段不允许在 ADS 重新计算**：`ads_gmv_daily.gmv` 直接 `SUM(dws.gmv_net)`，不要写成 `SUM(dwd.order_amount)`——后者口径变了没人知道。
6. **GMV 单一来源**：本模块把 `gmv_net` 定义在 DWS，所有下游共享。如果哪天业务要把"已支付未发货"也算进来，只改 DWD + DWS 的 `gmv_net` 一处即可，ADS 自动跟着变。
7. **ETL 幂等**：所有 `CREATE TABLE` 改 `CREATE OR REPLACE TABLE`，所有写入改 `INSERT OVERWRITE`，ETL 失败可以无脑重跑。生产调度系统每天凌晨可能跑两遍（正常 + 重跑），幂等是必须。
8. **代码评审的硬规则**：新提交的 SQL 改变 GMV 口径、改变维度关联条件、改变分区字段，必须有两个以上 reviewer 签字。这些字段的破坏是不可逆的——一旦上线，BI 报表会"看起来正常但数字错了"，几天后才会被业务方发现，损失巨大。
9. **测试先行**：每一层之间都要有自动化测试断言"上游 GMV = 下游 GMV"。本模块的 `test_gmv_reconciles_across_layers` 就是这种"分层契约测试"的最小实现——6 个测试覆盖 ODS/DWD/DWS/DWT/ADS/SCD-2，30 秒跑完，能在 ETL 写错的第一时间报警。
10. **数据血缘**：每一张 ADS 表必须有可追溯的上游引用链。生产中可以用 Apache Atlas / DataHub 自动采集血缘，开发环境至少在表注释里手动写一份"上游依赖"清单。
11. **慢 SQL 评审**：所有 DWS / ADS 查询超过 10 秒的，必须建索引或拆表，不允许靠加机器硬扛。慢 SQL 是数仓最大的隐性成本。
12. **版本与变更日志**：每张表加一列 `etl_version` 或注释 `last_modified`，出问题时能快速回溯到上一个正确版本。Hive 上的 `ALTER TABLE ... SET TBLPROPERTIES ('last_modified' = '...')` 是常用手法。

跑通本模块的端到端管线：

```bash
cd datawarehouse-learning
python -m pytest modules/07-offline-warehouse/tests/ -v
```

预期 6 个测试全部通过，分别校验：跨层 GMV 一致性、DWD 清洗规则、SCD-2 双版本、分区裁剪、DWS 行数对齐、DWT 主题用户数对齐。这套测试本身就是分层架构正确性的"实时体检报告"——任何一层算错都会立刻失败，把"业务方发现数据错了"前移到"开发提交时立刻报警"，这是数仓工程化最重要的杠杆之一。