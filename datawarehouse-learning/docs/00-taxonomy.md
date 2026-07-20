# 00 · Data Warehouse Taxonomy

The shared mental model used by every module in this repo. **Read this
once before any chapter; revisit when a new module introduces a name
you don't recognise.**

## 1. What is a data warehouse?

A **data warehouse (DW / DWH)** is a subject-oriented, integrated,
non-volatile, time-variant collection of data used to support
management decisions. (Bill Inmon, 1990.)

> A **data lake** stores raw data in native format (files, images,
> JSON). A **data warehouse** stores cleaned, conformed, modelled
> data for query. A **lakehouse** merges both: ACID on top of an open
> file format, so a single system serves both raw and modelled.

## 2. OLTP vs OLAP

```
                          OLTP                         OLAP
                ──────────────────         ──────────────────
   Workload     many small transactions     few large analytical queries
   Schema       3NF, write-optimised       star / snowflake, read-optimised
   Volume       GBs, fast single-row ops   TBs–PBs, scans over millions of rows
   Examples     MySQL, PostgreSQL, Oracle  Hive, Spark, Trino, ClickHouse, Doris
   Users        application / API          analyst / BI / data scientist
   Latency      ms                        seconds–minutes
   Indexes      B-tree, primary keys       columnar, partition pruning, bloom
   Consistency  strict (ACID)              eventual is fine for most layers
```

The **same physical data** may appear in both systems, modelled
differently. The warehouse is downstream of the OLTP system, fed by
ETL/ELT.

## 3. Layered architecture — the spine of this curriculum

A production warehouse is organised into **layers**, each with a
narrow contract. The naming varies (OneData, OdsDwdDwsAds, Medallion);
the *idea* is constant.

```
   ┌──────────────────────────────────────────────────────────┐
   │  ADS  Application Data Service      ←  wide tables for   │
   │                                       dashboards / APIs  │
   ├──────────────────────────────────────────────────────────┤
   │  DWT  Topic                          ←  cumulative state │
   │  DWS  Summary (per subject, per day) ←  light aggregates │
   ├──────────────────────────────────────────────────────────┤
   │  DWD  Detail                         ←  cleaned, joined, │
   │                                       SCD-aware rows     │
   ├──────────────────────────────────────────────────────────┤
   │  ODS  Operational Data Store         ←  raw landing,     │
   │                                       schema-on-read     │
   └──────────────────────────────────────────────────────────┘
```

| Layer | Contract | SCD? | Partition? | Joins allowed | Cardinality |
|---|---|---|---|---|---|
| **ODS** | bytes-in, bytes-out | none | by ingest date | none | as ingested |
| **DWD** | one row per business event, deduped, conformed | SCD-2 for dims | by `dt` (biz date) | with dim | millions–billions |
| **DWS** | one row per (subject, day, bucket) | snapshot | by `dt` | with DWD | 1k–10M |
| **DWT** | one row per subject, cumulative | n/a | by `dt` | with DWS | 10k–10M |
| **ADS** | one wide row per report row | n/a | by `dt` | any | small |

The modules in this repo touch all five. **Module 07** walks the
full `ODS → DWD → DWS → DWT → ADS` chain on the e-commerce dataset.

## 4. Dimensional modelling — Kimball

The single most important idea in warehouse design.

### 4.1 Fact vs dimension

A **fact** is a row measured by a business event: an order, a click,
a payment. Facts are numeric and additive.

A **dimension** is a *who/what/where/when* the fact is about: the
user, the product, the date. Dimensions are textual and descriptive.

### 4.2 Star schema

```
                   dim_date
                      │
                      │
   dim_product ── fact_orders ── dim_user
                      │
                      │
                  dim_status
```

Facts in the centre, dimensions radiating out. The "rays" are foreign
keys. Queries are simple `JOIN` on the primary key of each dim.

### 4.3 Snowflake schema

Dimensions are normalised: a `dim_product` has a `dim_category` FK.
Smaller dimension tables, more `JOIN`s. **Avoid** in warehouses unless
storage is at a real premium.

### 4.4 Slowly Changing Dimensions (SCD)

How does a dimension row change over time?

| Type | Behaviour | When to use |
|---|---|---|
| **SCD-1** | overwrite the row | when history doesn't matter (typo fix) |
| **SCD-2** | add a new row, mark `valid_from/valid_to` | when you need history (most cases) |
| **SCD-3** | keep previous value in a column | when only "previous" matters |
| **SCD-4** | history in a separate table | when current row must be cheap to read |

Most production warehouses use **SCD-2 for slowly changing attrs** and
**SCD-1 for type-2 error corrections**. SCD-2 makes the dimension
table a fact itself: it has a `dt` partition.

### 4.5 Fact types

| Type | Grain | Example |
|---|---|---|
| **Transaction** | one event | one row per order |
| **Periodic snapshot** | one per period per entity | one row per (user, day) |
| **Accumulating snapshot** | one per lifecycle, updated as it progresses | one row per (order), columns updated at each status change |

## 5. Other modelling methods

| Method | When to use | Cost |
|---|---|---|
| **3NF / Inmon CIF** | enterprise warehouse, many sources, stable | expensive to evolve, lots of joins |
| **Dimensional (Kimball)** | BI / dashboard / reporting | easy to query, hard to add sources |
| **Data Vault 2.0** | many sources, audit, agility | high storage, complex queries |
| **Anchor modelling** | highly evolving, normalised history | niche, very normalised |
| **OBT (One Big Table)** | ML feature store, single denormalised wide | loses flexibility, refresh is heavy |

This repo teaches **Kimball first** (modules 01, 07), then
**Data Vault** (module 01 §5) so the learner can read production code
in both styles.

## 6. Storage & file format

| Format | Splittable | Columnar | Compressible | ACID | Used by |
|---|---|---|---|---|---|
| **CSV / JSON** | yes | no | poor | no | ODS only |
| **Parquet** | yes | **yes** | excellent | no | Spark, Trino, Iceberg |
| **ORC** | yes | yes | excellent | no | Hive, Spark |
| **Avro** | yes | no | medium | no | Kafka, schema evolution |
| **Iceberg** | yes | yes | excellent | **yes** | Spark, Trino, Flink |
| **Hudi** | yes | yes | excellent | **yes** | Spark, Flink |
| **Delta Lake** | yes | yes | excellent | **yes** | Spark, Trino |

**Parquet + Iceberg** is the modern default. ORC is the Hive
incumbent.

## 7. Partitioning & bucketing

Two orthogonal axes to physically organise data.

**Partitioning** = directory-level split by column value
(`dt=2025-01-01/`). Best for low-cardinality columns used in `WHERE`
predicates (`dt`, `region`).

**Bucketing (clustering)** = within-file hash split by column
(`hash(user_id) % 256`). Best for high-cardinality columns used in
joins or point lookups.

Rule of thumb: **partition by `dt`**, **cluster by the most-joined
column** (user_id, order_id).

## 8. SQL patterns the warehouse uses

The chapters implement the same six patterns in every engine:

| Pattern | One-liner | Engine example |
|---|---|---|
| `GROUP BY` aggregation | per-bucket summary | all |
| **Window function** | running total, rank, lag, lead | all (SQL:2003) |
| **Recursive CTE** | hierarchy traversal, BOM explosion | Spark 3+, Trino, Postgres |
| **PIVOT / UNPIVOT** | rows ↔ columns | Spark, Trino, Hive (limited) |
| **LATERAL / APPLY** | per-row subquery with joins | Trino, Postgres, Spark 3+ |
| **Approximation** | `approx_count_distinct`, t-digest | Spark, Trino, Doris |

## 9. Real-time architecture

### 9.1 Lambda

```
       ┌──────────── batch layer ────────────┐
source─┤  HDFS / Hive  ──  Spark batch  ──┐   │
       └──────────────────────────────────┼───┤
       ┌─────── speed layer ──────────┐   │   ├── serve
source─┤  Kafka  ──  Flink stream  ──┘   │   │
       └──────────────────────────────────┘
```

Two paths, same query merges them. **Cost: duplicate code, merge
logic.**

### 9.2 Kappa

```
source ── Kafka (retained) ── Flink ── serve
```

One path, replayable from Kafka. **Cost: state must fit in stream
processor; long backfills re-process everything.**

### 9.3 Lakehouse / Iceberg / Hudi / Paimon

```
source ── Kafka ── Flink CDC ── Iceberg table ── Trino/Spark query
```

Stream and batch both read the same Iceberg table. Flink writes CDC
into the lake; Spark / Trino query the lake. **Cost: depends on
the engine; CDC is the hard part.**

Module 12 builds all three. Module 18 combines them.

## 10. The seven problems every layer has to solve

The chapters in this repo are organised around these:

1. **Ingest** — how does data enter the warehouse?
   (file drop, CDC, streaming, API pull)
2. **Store** — file format, partitioning, bucketing, compression
3. **Model** — dimensional, Data Vault, OBT, anchor
4. **Compute** — batch, micro-batch, streaming, interactive
5. **Serve** — wide table, dashboard, API, ML feature
6. **Govern** — quality, lineage, security, cost
7. **Observe** — query history, slow log, lineage UI, alerts

## 11. The five roles in a data team

| Role | Concern | This repo's coverage |
|---|---|---|
| **Data engineer** | build, schedule, monitor the pipeline | Modules 04–08, 17 |
| **Analytics engineer** | model the warehouse, write dbt/SQL | Modules 01, 07, 12, 15 |
| **Data analyst** | write SQL on the warehouse | Modules 02, 14, 17 |
| **Data scientist** | build features / train models on the warehouse | Modules 14, 18 |
| **Platform engineer** | the engine itself, resource, cost | Modules 04, 13, 14, 17 |

A learner can be a beginner in any one and finish the curriculum as a
"**T-shaped data engineer**": deep in one role, conversant in the
other four.

## 12. Reading order

```
00  this file
01  数仓基础概念与理论        (the vocabulary anchor)
02  SQL 进阶                 (the universal language)
03  Linux / Python           (the data engineer's toolbox)
04  Hadoop 生态              (the legacy foundation)
05  Hive                     (the legacy offline engine)
06  Spark                    (the modern offline engine)
07  离线分层建模              (the offline pattern)
08  调度                     (the offline glue)
09  Kafka                    (the streaming foundation)
10  Flink 基础               (the streaming engine)
11  Flink SQL + CDC          (the streaming pattern)
12  实时分层                  (the streaming warehouse)
13  数据湖                   (the modern foundation)
14  OLAP 引擎                (the modern query layer)
15  数据质量                 (the governance layer)
16  元数据 / 安全            (the governance plumbing)
17  调优                     (the expert toolbox)
18  综合实战                 (the synthesis)
```

After 07 you can build an offline warehouse. After 12 you can build
a real-time one. After 14 you can query either. After 17 you can
operate either. After 18 you have shipped one.
