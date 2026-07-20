# Docker Stack — optional full cluster

This compose file brings up a full data-warehouse stack. **It is
optional.** The curriculum runs end-to-end on a single laptop using
DuckDB; the cluster is for learners who want hands-on experience
with Hive / Spark / Flink / Trino / Kafka / ClickHouse / Doris.

## Start

```bash
docker compose up -d                    # full stack (~ 8 GB)
docker compose up -d postgres minio spark-master spark-worker   # minimal
docker compose ps
docker compose logs -f hive-server
docker compose down
```

## Services

| Service        | Port  | What it is                              |
|---|---|---|
| postgres       | 5432  | metastore for Hive / Airflow             |
| namenode       | 9870  | HDFS NameNode web UI                     |
| datanode       | 9864  | HDFS DataNode                            |
| hive-server    | 10000 | Hive Thrift                              |
| spark-master   | 8081  | Spark master web UI                      |
| kafka          | 9092  | Kafka broker                             |
| kafka-ui       | 8084  | Kafka web UI                             |
| flink          | 8082  | Flink dashboard                          |
| trino          | 8083  | Trino UI                                 |
| clickhouse     | 8123  | ClickHouse HTTP                          |
| doris-fe       | 8030  | Doris front-end                          |
| doris-be       | 8040  | Doris back-end                           |
| minio          | 9001  | MinIO console (S3)                       |
| airflow        | 8080  | Airflow (admin / admin)                  |
| jupyter        | 8888  | Notebook IDE (token: datawarehouse)      |

## Connection strings

```python
# Python clients
from pyhive import hive            # Hive: localhost:10000
from kafka import KafkaProducer    # Kafka: localhost:9092
from trino.dbapi import connect    # Trino: localhost:8080
import clickhouse_driver            # ClickHouse: localhost:9000
```

```sql
-- beeline (Hive)
!beeline -u jdbc:hive2://localhost:10000

-- Trino CLI
docker exec -it trino trino

-- ClickHouse
docker exec -it clickhouse clickhouse-client
```

## Resource requirements

The full stack uses ~8 GB RAM at idle and ~16 GB under load. For a
modest laptop, start only what you need:

```bash
# just Spark + MinIO for an Iceberg exercise
docker compose up -d postgres minio spark-master spark-worker

# just Kafka + Flink for a streaming exercise
docker compose up -d kafka flink-jobmanager flink-taskmanager
```

## Volumes

All data is persisted in named Docker volumes. `docker compose down`
keeps them; `docker compose down -v` removes them.
