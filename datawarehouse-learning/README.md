# Data Warehouse — A From-0-to-Expert Curriculum

> 18 modules, one shared SQL contract, one end-to-end e-commerce demo
> dataset. Read top-to-bottom and you can design, build, and operate a
> production-grade data warehouse — offline, real-time, and lakehouse —
> and defend your choices in a code review.

## What this is

A complete, runnable curriculum on **data warehousing** that takes a
beginner to expert level. It covers:

- **Theory** — OLTP vs OLAP, 3NF, dimensional modeling, Data Vault,
  slowly changing dimensions, data lake vs warehouse vs lakehouse.
- **SQL** — window functions, recursive CTE, query plans, optimisation.
- **Linux/Python** — shell pipelines, data engineering in Python
  (pandas, pyarrow, polars).
- **Offline stack** — Hadoop, Hive, Spark SQL, layered warehouse
  (ODS/DWD/DWS/ADS), Airflow scheduling.
- **Real-time stack** — Kafka, Flink DataStream / SQL / CDC, Kappa
  architecture, real-time layered warehouse.
- **Lakehouse** — Iceberg / Hudi / Delta Lake / Paimon, OLAP engines
  (Trino, ClickHouse, Doris, StarRocks).
- **Governance** — data quality, metadata (DataHub/Atlas), security
  (masking, row-level policies).
- **Expert topics** — performance tuning, cost optimisation,
  end-to-end capstone project.

Every module is **runnable on Windows / macOS / Linux without a
cluster**. The SQL contract is portable: it runs against DuckDB locally
and against Hive / Spark / Trino / Flink in `docker-compose`. Each
module ships its own tests asserting the **same invariants** in its
target engine, so a learner can compare solutions engine-by-engine on
the same problem.

## Reading order

```
00  shared taxonomy (docs/00-taxonomy.md) — read this first
01  数仓基础概念与理论
02  关系型数据库与 SQL 进阶
03  Linux / Shell / Python 数据工程基础
04  Hadoop / HDFS / YARN 生态
05  Hive 数仓建设
06  Spark SQL 与 Spark 离线数仓
07  离线数仓分层建设 (ODS/DWD/DWS/ADS) 与维度建模
08  调度系统 Airflow / DolphinScheduler
09  Kafka 消息队列与数据接入
10  Flink 基础与 DataStream API
11  Flink SQL 与 Flink CDC
12  实时数仓分层架构 (Lambda / Kappa / 湖仓)
13  数据湖 Iceberg / Hudi / Delta Lake / Paimon
14  OLAP 查询引擎 (Trino / ClickHouse / Doris / StarRocks)
15  数据质量管理
16  元数据管理与数据安全
17  性能调优与成本优化
18  专家综合实战 (电商离线+实时+湖仓一体化)
```

After modules 01–07 you can build an offline warehouse. After 08–12
you can run a real-time pipeline. After 13–14 you understand the
modern lakehouse. After 15–16 you can govern it. After 17–18 you can
ship it to production.

## The shared SQL contract

Every module implements a subset of the same SQL contract defined in
`sql-contract/contracts.sql`. The reference implementation runs
against **DuckDB** (a single-binary OLAP engine, ideal for learning).
A learner can:

```bash
# Install once
pip install -r requirements.txt

# Run all module tests (works offline, no cluster required)
pytest tests/ -v

# Or run one module
pytest modules/05-hive/tests/ -v

# Or run the capstone end-to-end
python scripts/run_capstone.py
```

The Docker compose file at `docker/docker-compose.yml` brings up an
optional full stack (Hive, Spark, Flink, Trino, Kafka) for learners
who want hands-on cluster experience.

## The shared demo dataset

A single e-commerce dataset is used across all modules:

| Table | Rows | Description |
|---|---|---|
| `users` | 10,000 | user profiles (id, name, level, register_date) |
| `products` | 1,000 | products (id, name, category, price) |
| `orders` | 100,000 | order headers (user_id, total, status, ts) |
| `order_items` | ~300,000 | order line items (order_id, product_id, qty) |
| `user_events` | ~5,000,000 | clickstream (user_id, event_type, page, ts) |

Generated deterministically by `shared/generate_data.py`. Same
dataset is reused by every module so SQL results are comparable.

## Five-layer architecture — the curriculum at a glance

| Layer | Purpose | Example tables |
|---|---|---|
| **ODS** (Operational Data Store) | Raw landing, schema-on-read | `ods_orders_raw` |
| **DWD** (Data Warehouse Detail) | Cleaned, conformed, deduplicated | `dwd_orders`, `dwd_user_events` |
| **DWS** (Data Warehouse Summary) | Per-subject daily/light aggregates | `dws_user_1d`, `dws_product_1d` |
| **DWT** (Data Warehouse Topic) | Cumulative subject state | `dwt_user_topic` |
| **ADS** (Application Data Service) | Application-facing wide tables | `ads_user_rfm`, `ads_gmv_daily` |

After 07 you can build all five layers end-to-end. After 12 you can
stream them in real-time. After 18 you can run a real business.

## Six universal problems

The chapters in every module are organised around the same six
problems, so you can compare solutions:

1. **Ingest** — how does data enter the warehouse? (batch file, CDC,
   streaming)
2. **Store** — file format, partitioning, bucketing, compression
   (Parquet, ORC, ZSTD, Snappy)
3. **Model** — dimensional (Kimball), Data Vault, One Big Table,
   anchor modelling
4. **Compute** — batch (Hive / Spark), micro-batch (Spark Streaming),
   streaming (Flink), interactive (Trino)
5. **Serve** — wide table, dashboard, API, ML feature store
6. **Govern** — quality, lineage, security, cost

## Quick start

```bash
cd datawarehouse-learning
pip install -r requirements.txt
python shared/generate_data.py --scale small
pytest tests/ -v                     # ~100 tests, runs in <2 min
python scripts/print_curriculum.py   # prints the module table
python scripts/run_capstone.py       # runs the end-to-end capstone
```

For the full Docker stack:

```bash
cd datawarehouse-learning/docker
docker compose up -d                 # Hive, Spark, Flink, Trino, Kafka
```

## What an expert can do after this curriculum

| Skill | Where you learn it |
|---|---|
| Design a layered warehouse (ODS→ADS) | Module 07, 12, 18 |
| Choose between Hive, Spark, Flink, Trino | Module 14, 17 |
| Model dimensions correctly (SCD-1/2/3) | Module 01, 07 |
| Build a real-time pipeline with exactly-once | Module 11, 12 |
| Tune a slow query (plan, partition, skew) | Module 17 |
| Design a lakehouse (Iceberg / Hudi / Paimon) | Module 13, 18 |
| Implement data quality rules and monitoring | Module 15 |
| Trace data lineage end-to-end | Module 16, 18 |
| Defend a warehouse design in a code review | All modules, esp. 07 / 12 / 18 |

## Layout

```
datawarehouse-learning/
├── README.md                  ← this file
├── requirements.txt           ← duckdb, pandas, pyarrow, polars, pytest
├── docs/
│   ├── 00-taxonomy.md         ← the shared mental model
│   ├── 01-how-to-run.md       ← per-module toolchain table
│   ├── 02-architecture.md     ← layered warehouse, Lambda, Kappa, Lakehouse
│   └── 03-modeling.md         ← dimensional, Data Vault, anchor
├── shared/
│   ├── generate_data.py       ← deterministic e-commerce dataset
│   ├── sql_runner.py          ← portable SQL execution harness
│   └── data_quality.py        ← DQ rules
├── sql-contract/
│   ├── contracts.sql          ← the cross-engine SQL contract
│   ├── reference_duckdb.sql   ← reference implementation
│   └── invariants.md          ← documented invariants
├── tests/
│   ├── test_contracts_duckdb.py
│   └── test_data_quality.py
├── scripts/
│   ├── print_curriculum.py
│   ├── run_capstone.py
│   └── run_all_demos.py
├── modules/                   ← one subdirectory per topic
│   ├── 01-concepts/           基础概念与理论
│   ├── 02-sql-advanced/       SQL 进阶
│   ├── 03-linux-python/       Linux / Python
│   ├── 04-hadoop/             Hadoop 生态
│   ├── 05-hive/               Hive
│   ├── 06-spark/              Spark
│   ├── 07-offline-warehouse/  离线分层建模
│   ├── 08-scheduler/          调度系统
│   ├── 09-kafka/              Kafka
│   ├── 10-flink-basics/       Flink 基础
│   ├── 11-flink-sql-cdc/      Flink SQL + CDC
│   ├── 12-realtime-warehouse/ 实时分层
│   ├── 13-data-lake/          数据湖
│   ├── 14-olap/               OLAP 引擎
│   ├── 15-data-quality/       数据质量
│   ├── 16-metadata-security/  元数据 / 安全
│   ├── 17-tuning/             调优
│   └── 18-capstone/           综合实战
└── docker/
    ├── docker-compose.yml     ← optional full stack
    └── README.md
```

## Quality gates (verified: 134 tests pass)

```bash
# Top-level SQL contract: 21 tests in ~1s
pytest tests/ -v

# All 18 modules: 134 tests in ~30s
pytest tests/ modules/ -q

# End-to-end capstone (offline + DQ assertions)
python scripts/run_capstone.py

# Print the curriculum as a markdown table
python scripts/print_curriculum.py
```

**Test inventory** (134 total):

| Module | Tests |
|---|---|
| 01 concepts | 13 |
| 02 SQL | 13 |
| 03 Linux/Python | 3 |
| 04 Hadoop | 5 |
| 05 Hive | 5 |
| 06 Spark | 5 |
| 07 Offline warehouse | 6 |
| 08 Scheduler | 8 |
| 09 Kafka | 4 |
| 10 Flink | 5 |
| 11 Flink CDC | 5 |
| 12 Realtime | 5 |
| 13 Data lake | 4 |
| 14 OLAP | 11 |
| 15 DQ | 5 |
| 16 Metadata | 4 |
| 17 Tuning | 4 |
| 18 Capstone | 8 |
| top-level contract | 21 |
| **Total** | **134** |

## Reading this repo

1. Read `docs/00-taxonomy.md` once. It defines the vocabulary the rest
   of the repo uses.
2. Run `python shared/generate_data.py --scale small && pytest tests/
   -v`. This makes the SQL contract tangible.
3. Read any one module (07 recommended) end-to-end. Every module has
   the same shape: README → src/ → tests/.
4. Pick the engine you use at work (Hive / Spark / Flink / Trino), read
   its module, run its tests.
5. Then read *one other* engine — preferably one whose model is
   *different* (Flink if you write Spark; Trino if you write Hive).
   That contrast is the curriculum.
6. Run the capstone (18) end-to-end to lock it all in.

## License

BSD-3-Clause.
