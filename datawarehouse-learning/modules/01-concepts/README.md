# Module 01 · 数仓基础概念与理论

> 这一章回答"什么是数仓、为什么要建数仓、怎样建数仓"。
> 不依赖任何执行引擎；所有 demo 跑在 DuckDB 上（in-memory，无集群）。

读完这一章你能：

- 区分 OLTP / OLAP / HTAP，说出每种系统适合什么场景
- 解释 3NF、维度建模、Data Vault 三种建模方法的取舍
- 画出"星型模型"和"雪花模型"
- 说出 SCD-1 / SCD-2 / SCD-3 的差异并实现 SCD-2
- 描述仓库分层（ODS/DWD/DWS/DWT/ADS）的契约

## 章节

- [ch01 · OLTP vs OLAP vs HTAP](#ch01--oltp-vs-olap-vs-htap)
- [ch02 · 范式：1NF / 2NF / 3NF](#ch02--范式1nf--2nf--3nf)
- [ch03 · 维度建模：星型 vs 雪花](#ch03--维度建模星型-vs-雪花)
- [ch04 · SCD：缓慢变化维](#ch04--scd缓慢变化维)
- [ch05 · 仓库分层与命名规范](#ch05--仓库分层与命名规范)
- [ch06 · Data Vault 2.0 简介](#ch06--data-vault-20-简介)
- [ch07 · One Big Table (OBT) 与反范式](#ch07--one-big-table-obt-与反范式)
- [ch08 · 概念辨析与常见面试题](#ch08--概念辨析与常见面试题)

## 快速开始

```bash
# 1. 生成 demo 数据
python shared/generate_data.py --scale small

# 2. 跑本章测试
pytest modules/01-concepts/tests/ -v
```

---

## ch01 · OLTP vs OLAP vs HTAP

```
                OLTP                OLAP                HTAP
            (事务处理)            (分析处理)            (混合负载)
─────────────────────────────────────────────────────────────
典型系统    MySQL / PG / Oracle   Hive / Spark / Doris   TiDB / OceanBase /
            / SQL Server         / ClickHouse / Trino   PolarDB / Aurora
负载        短小写为主            长时间扫描            两者混合
行数        10^6 ~ 10^8           10^8 ~ 10^12          同 OLTP
延迟        ms                    s ~ min               ms 写 / s 读
索引        B-tree / PK           列存 / 分区 / bloom   自适应
一致性      强 (ACID)             最终一致足够           强
建模        3NF                   星型 / OBT            自适应
```

> **仓库不是替代 OLTP，而是 OLTP 的下游。** 数据从 OLTP 经
> ETL/ELT 进入仓库（ODS → DWD → DWS → ADS），供分析侧消费。

OLTP 系统专注于"这一次"事务的正确性，OLAP 系统专注于"跨时间
跨主体"的分析效率。两者的**物理形态不同**（行存 vs 列存），
**schema 不同**（3NF vs 星型），**用户不同**（应用 vs 分析师）。

**HTAP**（Hybrid Transaction/Analytical Processing）试图把两者合
到一套系统里。优势是消除了 ETL 延迟，劣势是写入路径和分析
路径会互相干扰。**典型场景**：实时风控、实时推荐、实时大屏。
**典型系统**：TiDB、OceanBase、PolarDB、SingleStore、Aurora。

```python
# 看一个查询在 OLTP 和 OLAP 上"应该多快"
import duckdb
# OLAP-style aggregation: full scan, 100k rows
print(duckdb.sql("SELECT status, COUNT(*) FROM read_parquet('data/small/orders.parquet') GROUP BY status").df())
#  OLAP 期望: 几十 ms
#  OLTP 期望: 几秒甚至超时（设计就不对）
```

---

## ch02 · 范式：1NF / 2NF / 3NF

| 范式 | 规则 | 解决 |
|---|---|---|
| **1NF** | 字段原子、不可再分 | 多值字段 |
| **2NF** | 非主属性完全依赖主键 | 部分依赖 |
| **3NF** | 非主属性不传递依赖主键 | 传递依赖 |
| **BCNF** | 每个决定因素都是候选键 | 3NF 不足 |
| **4NF** | 消除非主属性的多值依赖 | MVD |
| **5NF** | 消除连接依赖 | 几乎不可达 |

仓库"通常反范式"，但**不是说仓库不要范式**：

- 仓库的 **DIM 层** 经常是反 3NF（冗余常用字段换 join 速度）
- 仓库的 **ODS 层** 保留源系统范式（不动原数据）
- 仓库的 **DWS 层** 按"主题"聚合，进一步反范式

```sql
-- 3NF 违反示例：订单表里直接写了用户名
CREATE TABLE orders_bad (
  order_id     BIGINT,
  user_id      BIGINT,
  user_name    VARCHAR,    -- 冗余！应去 dim_user
  total        DECIMAL
);

-- 修：拆出 dim_user
CREATE TABLE dim_user (
  user_id      BIGINT PRIMARY KEY,
  user_name    VARCHAR
);
CREATE TABLE orders (
  order_id     BIGINT PRIMARY KEY,
  user_id      BIGINT REFERENCES dim_user,
  total        DECIMAL
);
```

---

## ch03 · 维度建模：星型 vs 雪花

### 星型 (Star Schema)

```
                 dim_date
                    │
                    │
   dim_product ── fact_orders ── dim_user
                    │
                    │
                dim_status
```

- 事实表 (fact) 在中心，**高度规范化（窄）**
- 维度表 (dim) 在外圈，**故意反范式（宽）**
- 一个事实表通常有 5-15 个外键，每个指向一个 dim
- 查询路径短，BI 工具友好

### 雪花 (Snowflake)

```
                 dim_date
                    │
                    │
   dim_category── dim_product ── fact_orders ── dim_user
                                          │
                                       dim_status
```

- 维度表继续拆分（如 dim_product 拆出 dim_category）
- 节省存储（维度重复少），但 **join 路径变长**
- 现代仓库几乎不推荐——查询慢，ETL 复杂

### 星座 (Galaxy / Fact Constellation)

多个事实表共享维度。**生产中更常见**——订单事实、支付事实、退款事实共享 `dim_user` `dim_date`。

```sql
-- demo: 星型 schema
CREATE TABLE fact_orders (
  order_id     BIGINT,
  user_key     BIGINT,
  product_key  BIGINT,
  date_key     INT,
  status_key   INT,
  total        DECIMAL(18,2)
);
CREATE TABLE dim_user    (user_key BIGINT PRIMARY KEY, ...);
CREATE TABLE dim_product (product_key BIGINT PRIMARY KEY, ...);
CREATE TABLE dim_date    (date_key INT PRIMARY KEY, ...);
```

---

## ch04 · SCD：缓慢变化维

缓慢变化维 (Slowly Changing Dimension) 描述**维度属性随时间
变化**该如何在仓库里记录。

| 类型 | 行为 | 例子 | 优点 | 缺点 |
|---|---|---|---|---|
| **SCD-1** | 直接覆盖 | 用户改了名字 | 简单 | 历史丢失 |
| **SCD-2** | 加新行 + 有效期 | 用户升级到 gold | 完整历史 | 表膨胀 |
| **SCD-3** | 增加"前值"列 | 只关心"上一个 level" | 中等历史 | 仅一条历史 |
| **SCD-4** | 拆出历史表 | 极少用 | 当前表窄 | 双表维护 |
| **SCD-6** | 1+2+3 混合 | 需要时使用 | 灵活 | 复杂 |

**SCD-2 是仓库最常用的**——保留"任意时间点"的维度快照。

```sql
-- SCD-2 实现 (DuckDB 语法)
CREATE TABLE dim_user_scd2 (
  user_id      BIGINT,
  user_name    VARCHAR,
  level        VARCHAR,
  valid_from   DATE,
  valid_to     DATE,
  is_current   BOOLEAN,
  PRIMARY KEY (user_id, valid_from)
);

-- 当 level 变化时,关掉旧行,开新行
UPDATE dim_user_scd2
SET valid_to = CURRENT_DATE - INTERVAL 1 DAY, is_current = FALSE
WHERE user_id = 42 AND is_current = TRUE;

INSERT INTO dim_user_scd2
VALUES (42, 'alice', 'gold', CURRENT_DATE, DATE '9999-12-31', TRUE);
```

测试文件：[`tests/test_scd2.py`](tests/test_scd2.py) 演示完整的 SCD-2 ETL。

---

## ch05 · 仓库分层与命名规范

```
   ┌─────────────────────────────────────────────────────┐
   │  ADS  应用层 (宽表)                                   │
   │       ads_user_rfm, ads_gmv_daily, ads_funnel_7d     │
   ├─────────────────────────────────────────────────────┤
   │  DWT  主题累积 (单行)                                 │
   │       dwt_user_topic, dwt_product_topic              │
   ├─────────────────────────────────────────────────────┤
   │  DWS  主题日汇总 (一天一行的轻度聚合)                  │
   │       dws_user_order_1d, dws_product_sales_1d        │
   ├─────────────────────────────────────────────────────┤
   │  DWD  明细 (一行一事件)                                │
   │       dwd_orders, dwd_user_events                    │
   ├─────────────────────────────────────────────────────┤
   │  DIM  公共维度 (SCD-2)                                │
   │       dim_user_scd2, dim_product, dim_date           │
   ├─────────────────────────────────────────────────────┤
   │  ODS  原始数据 (贴源落地)                              │
   │       ods_orders, ods_user_events                    │
   └─────────────────────────────────────────────────────┘
```

**命名规范**（推荐）：

- `ods_<source>_<entity>` — ODS
- `dwd_<entity>` — DWD
- `dws_<subject>_<period>` — DWS（`dws_user_order_1d` = 一天一行/用户）
- `dwt_<subject>` — DWT
- `ads_<report>` — ADS
- `dim_<entity>[_scd2]` — DIM

**每一层的契约**：

| 层 | 输入 | 输出 | 计算 | 唯一性 |
|---|---|---|---|---|
| ODS | 字节 | 字节 | 无 | 不强求 |
| DWD | ODS | 干净明细 | 清洗+去重+维度退化 | 自然键 |
| DWS | DWD | 主题日汇总 | 聚合 | 业务键+日期 |
| DWT | DWS | 主题累积 | 累计 | 业务键 |
| ADS | DWS+DWT | 宽表 | 业务拼接 | 报告粒度 |

---

## ch06 · Data Vault 2.0

Data Vault 是 Dan Linstedt 提出的、面向**多源集成 + 审计**的建模
方法。三种核心实体：

- **Hub** — 业务键 (business key)，如 `hub_user(user_id)`
- **Link** — 关系 (多对多)，如 `link_order_product(order_id, product_id)`
- **Satellite** — 描述属性（可随时间变化），如 `sat_user(user_id, level, name, load_dts)`

```sql
-- 极简 Data Vault (DuckDB 语法)
CREATE TABLE hub_user (
  user_id       BIGINT PRIMARY KEY,
  load_dts      TIMESTAMP,
  record_source VARCHAR
);
CREATE TABLE sat_user (
  user_id       BIGINT,
  load_dts      TIMESTAMP,
  hash_diff     VARCHAR,    -- 所有属性的 hash, 用于检测变化
  user_name     VARCHAR,
  level         VARCHAR,
  PRIMARY KEY (user_id, load_dts)
);
-- 加载时: 增量, 永远追加
INSERT INTO hub_user SELECT user_id, now(), 'ods.users' FROM ods.users
WHERE user_id NOT IN (SELECT user_id FROM hub_user);
INSERT INTO sat_user
SELECT user_id, now(), md5(concat(user_name, level)), user_name, level
FROM ods.users;
```

**优点**：所有表都追加，天然支持 audit / 重新加载；hub/link/sat
模式让 schema 演化（加维度）只影响一个 sat。

**缺点**：查询时要 join 多个 sat 才能拿到一个"业务实体"，**所
以 Data Vault 仓库**通常会在 DWS 层物化出"业务视图"（PIT 表）。

---

## ch07 · One Big Table (OBT) 与反范式

OBT 是 ML 特征工程和实时服务的常见做法：把所有需要的字段预
先 join 到一张超宽的事实表。

```
ads.user_features  (1 row per user)
──────────────────────────
user_id, age, gender, level, register_date,
order_count_30d, order_amount_30d,
last_event_ts, days_since_last_event,
rfm_score, churn_risk, ...
```

**优点**：

- 服务端一次 query 拿到所有特征，**低延迟** (ms 级)
- 训练侧 pandas / polars 一次加载即可

**缺点**：

- 字段多时**写放大**（一个 user 改一个字段可能要更新宽表）
- 大量 NULL（很多用户没有某些事件）
- 失去 schema 灵活性

**何时用**：

- 实时推荐、实时风控（延迟 < 50ms）
- 离线 ML 训练（pandas / polars 加载 CSV / Parquet）

**何时不用**：

- 探索性分析（ad-hoc query，宽表更新代价大）
- 强 schema 演化的业务（一个月加 5 个字段）

---

## ch08 · 概念辨析与常见面试题

> 这一节列出去年常考的面试题和"如果我面试官会怎么问"的
> 提示答案。每一道题都对应前几节的具体内容。

**Q1. 数据仓库和数据湖的区别？**
数据湖存原始数据（JSON / 图片 / 日志），schema-on-read，强
调"先存后用"；数据仓库存清洗后数据，schema-on-write，强调
"先建模后存"。湖仓（Lakehouse）把两者合一：在数据湖上加
ACID（Iceberg / Hudi / Delta），既能读原始又能跑 SQL 报表。

**Q2. 为什么要分层？**
- 故障隔离：上层错不影响下层
- 计算复用：DWS 一次聚合，ADS 多次复用
- 血缘清晰：每一层有明确输入输出
- 角色分工：ETL 工程师建 DWD，分析师写 ADS

**Q3. 什么是数据漂移 (data drift)？**
源系统字段含义/取值变化但下游未感知。**典型场景**：上游
"status" 取值从 5 个变 8 个，下游 DWD 没做处理，导致 ADS 出现
"unknown" 类别。**应对**：源系统 schema 变更通知 + DWD 层字段收敛。

**Q4. 拉链表是什么？和 SCD-2 关系？**
拉链表 = SCD-2 在物理上的实现：每条记录带 `valid_from / valid_to`。
查询"某天的状态"用 `dt BETWEEN valid_from AND valid_to`。
拉链表的**最大优势**：上游推过来的历史变更一次性可追溯；劣势
是表会越来越大（要按周期归档或分区清理）。

**Q5. 为什么 DWS 不能 join 事实表？**
DWS 的设计目的是"每个 subject 一天一行"——它已经是聚合结果。
Join 事实表会让行数爆炸，破坏 DWS 的"轻"特征。如果一定要
join，应放在 ADS 层。

**Q6. ODS 是 schema-on-read 还是 schema-on-write？**
都可以。**生产建议**：落地时强制 schema（拒绝字段不明的文件），
但**不做清洗**（不清脏数据、不去重、不改字段含义）。清洗
是 DWD 的活。

**Q7. 主数据 (MDM) 和维度的关系？**
主数据是**跨系统共享**的核心实体（用户、产品、账户）。维度
是**仓库内的描述**。主数据进入仓库时通常变成 `dim_<entity>`，
并可能带 SCD-2 跟踪其在源系统的历史变更。

**Q8. 维度退化 (degenerate dimension) 是什么？**
维度退化指**只有业务键、没有属性的"维度"**——如订单号、退款
单号。它们通常直接放在事实表里（不再单独成表），因为没有更
多属性可描述。例：`fact_orders(order_id, user_key, total, ...)`
里的 `order_id` 就是退化维度。

---

## 章末练习

1. 在 `src/ex01_star_schema.sql` 里把 orders 改成"星型模型"
2. 在 `src/ex02_scd2.sql` 里实现 SCD-2 的完整 ETL
3. 在 `tests/test_theory.py` 里加测试：拉链表取某天状态

## 文件

```
01-concepts/
├── README.md             ← 本文件
├── src/
│   ├── ex01_oltp_olap.py
│   ├── ex02_3nf.sql
│   ├── ex03_star_vs_snowflake.sql
│   ├── ex04_scd2.sql
│   ├── ex05_layered_naming.sql
│   ├── ex06_data_vault.sql
│   └── ex07_obt.sql
└── tests/
    ├── test_theory.py
    └── test_scd2.py
```
