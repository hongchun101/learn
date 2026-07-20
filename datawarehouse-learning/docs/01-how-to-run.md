# 01 · How to Run

Per-module toolchain table. Most modules run with Python + DuckDB
(no cluster required). Modules with a cluster option run with Docker.

## Universal install (Windows / macOS / Linux)

```bash
cd datawarehouse-learning
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt`:

```
duckdb>=0.10
pandas>=2.0
pyarrow>=14
polars>=0.20
pytest>=8.0
sqlalchemy>=2.0
faker>=22
```

## Per-module commands

| Module | Local command | Cluster option | Cluster compose service |
|---|---|---|---|
| 01 概念 | `pytest modules/01-concepts/tests/ -v` | n/a | n/a |
| 02 SQL 进阶 | `pytest modules/02-sql-advanced/tests/ -v` | Trino | `docker compose up trino -d` |
| 03 Linux/Python | `pytest modules/03-linux-python/tests/ -v` | n/a | n/a |
| 04 Hadoop | read-only | HDFS | `docker compose up namenode datanode -d` |
| 05 Hive | `pytest modules/05-hive/tests/ -v` | Hive | `docker compose up hive-metastore hive-server -d` |
| 06 Spark | `pytest modules/06-spark/tests/ -v` | Spark | `docker compose up spark-master spark-worker -d` |
| 07 离线分层 | `pytest modules/07-offline-warehouse/tests/ -v` | Hive / Spark | see above |
| 08 调度 | `pytest modules/08-scheduler/tests/ -v` | Airflow | `docker compose up airflow -d` |
| 09 Kafka | `pytest modules/09-kafka/tests/ -v` | Kafka | `docker compose up kafka -d` |
| 10 Flink 基础 | `pytest modules/10-flink-basics/tests/ -v` | Flink | `docker compose up flink -d` |
| 11 Flink SQL/CDC | `pytest modules/11-flink-sql-cdc/tests/ -v` | Flink + Kafka | see above |
| 12 实时分层 | `pytest modules/12-realtime-warehouse/tests/ -v` | Flink + Kafka | see above |
| 13 数据湖 | `pytest modules/13-data-lake/tests/ -v` | Spark + Iceberg | `docker compose up spark-iceberg -d` |
| 14 OLAP | `pytest modules/14-olap/tests/ -v` | Trino/ClickHouse/Doris | see compose |
| 15 数据质量 | `pytest modules/15-data-quality/tests/ -v` | n/a | n/a |
| 16 元数据/安全 | `pytest modules/16-metadata-security/tests/ -v` | n/a | n/a |
| 17 调优 | `pytest modules/17-tuning/tests/ -v` | n/a | n/a |
| 18 综合 | `python scripts/run_capstone.py` | full stack | `docker compose up -d` |

## Cluster bring-up

```bash
cd datawarehouse-learning/docker
docker compose up -d        # start the full stack
docker compose ps           # show running services
docker compose logs -f hive # tail a service
docker compose down         # tear down
```

The compose file provisions:

- `namenode` / `datanode` — HDFS
- `hive-metastore` / `hive-server` — Hive on Postgres
- `spark-master` / `spark-worker` — Spark 3.5
- `kafka` / `kafka-ui` — Kafka 3.6 with UI on :8080
- `flink-jobmanager` / `flink-taskmanager` — Flink 1.18
- `trino` — Trino 435
- `clickhouse` — ClickHouse 24
- `airflow` — Airflow 2.9
- `postgres` — metastore for Hive / Airflow
- `minio` — S3-compatible object store for Iceberg

## Notes on Windows

- Docker Desktop is required for the cluster option.
- The local path uses Windows paths; DuckDB and pytest are
  pure-Python / native and work on Windows.
- Path separators in code are always forward slashes for portability.
- For long path support, enable in Windows registry
  (`LongPathsEnabled=1`) or keep the repo close to the root.

## Running the full test suite

```bash
pytest -q                    # quick, ~30 s
pytest --tb=short -v         # verbose with short tracebacks
pytest -k "module_07" -v     # one module
```

## Running the capstone

```bash
# 1. Generate data (idempotent)
python shared/generate_data.py --scale medium

# 2. Run the end-to-end pipeline (offline + simulated streaming)
python scripts/run_capstone.py

# 3. Run the validation tests
pytest modules/18-capstone/tests/ -v
```
