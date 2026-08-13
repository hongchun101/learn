# 第 9 章：生态集成

## 9.1 Kafka 集成

### 9.1.1 Kafka 引擎

```sql
-- 1. 创建 Kafka 消费表
CREATE TABLE events_kafka
(
    event_id UInt64,
    event_time DateTime,
    user_id UInt64,
    event_type LowCardinality(String),
    amount Decimal(10, 2),
    metadata Map(String, String)
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka1:9092,kafka2:9092,kafka3:9092',
    kafka_topic_list = 'user_events',
    kafka_group_name = 'clickhouse_consumer_group_1',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1,
    kafka_thread_per_consumer = 1,
    kafka_max_block_size = 1048576,
    kafka_poll_timeout_ms = 500,
    kafka_handle_error_mode = 'stream',
    kafka_commit_on_select = 1;

-- 2. 目标表
CREATE TABLE events_target
(
    event_id UInt64,
    event_time DateTime,
    user_id UInt64,
    event_type LowCardinality(String),
    amount Decimal(10, 2),
    metadata Map(String, String)
) ENGINE = MergeTree
PARTITION BY toYYYYMMDD(event_time)
ORDER BY (event_type, user_id, event_time);

-- 3. 物化视图
CREATE MATERIALIZED VIEW events_mv TO events_target AS
SELECT * FROM events_kafka;
```

### 9.1.2 多 Topic、Pattern 订阅

```sql
-- 多 Topic
SETTINGS kafka_topic_list = 'topic1,topic2,topic3';

-- 模式匹配（24.x+）
SETTINGS kafka_topic_list = 'events_.*';
-- 订阅 events_user, events_order, events_pay 等
```

### 9.1.3 容错处理

```sql
SETTINGS
  kafka_handle_error_mode = 'stream',  -- 错误数据不丢失
  kafka_commit_on_select = 1,          -- 读取后才提交 offset
  input_format_parallel_parsing = 1,    -- 并行解析
  input_format_skip_unknown_fields = 1; -- 跳过未知字段
```

### 9.1.4 错误数据查看

```sql
-- 创建错误流表
CREATE TABLE events_errors
(
    raw_message String,
    error String,
    topic String,
    partition UInt64,
    offset UInt64
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka1:9092',
    kafka_topic_list = 'user_events',
    kafka_group_name = 'error_handler',
    kafka_format = 'JSONEachRow';

-- 配合 kafka_handle_error_mode = 'stream'
-- 错误数据进入此表，可查询分析
```

## 9.2 ClickHouse 与 MySQL 同步

### 9.2.1 MaterializedMySQL（24.x 推荐）

```sql
-- 1. 开启特性
SET allow_experimental_database_materialized_mysql = 1;

-- 2. 创建物化数据库
CREATE DATABASE mysql_replica
ENGINE = MaterializedMySQL(
    'mysql_host:3306',
    'source_db',
    'mysql_user',
    'mysql_password'
);

-- 3. 自动同步所有表
SHOW TABLES FROM mysql_replica;

-- 4. 查看同步状态
SELECT
    database,
    table,
    engine,
    total_rows
FROM system.tables
WHERE database = 'mysql_replica';

-- 5. 同步延迟
SELECT
    database,
    table,
    seconds_behind_source
FROM system.materialized_mysql_info
```

### 9.2.2 MySQL 表函数

```sql
-- 一次性查询（不缓存）
SELECT *
FROM mysql('mysql_host:3306', 'db', 'table', 'user', 'password')
WHERE id > 1000
LIMIT 100;

-- 性能差，每次都重新连接
```

### 9.2.3 DataX 同步

```json
{
  "job": {
    "setting": {
      "speed": {
        "channel": 4
      }
    },
    "content": [
      {
        "reader": {
          "name": "mysqlreader",
          "parameter": {
            "username": "root",
            "password": "password",
            "column": ["id", "name", "created_at"],
            "splitPk": "id",
            "where": "id > 0",
            "connection": [
              {
                "table": ["orders"],
                "jdbcUrl": ["jdbc:mysql://host:3306/db"]
              }
            ]
          }
        },
        "writer": {
          "name": "clickhousewriter",
          "parameter": {
            "username": "default",
            "password": "",
            "column": ["id", "name", "created_at"],
            "connection": [
              {
                "table": ["orders"],
                "jdbcUrl": ["jdbc:clickhouse://host:8123/db"]
              }
            ]
          }
        }
      }
    ]
  }
}
```

## 9.3 ClickHouse 与 PostgreSQL

```sql
-- 1. PostgreSQL 引擎（只读）
CREATE TABLE pg_table
(
    id UInt32,
    name String,
    data String
) ENGINE = PostgreSQL(
    'pg_host:5432',
    'db',
    'table',
    'user',
    'password',
    'public'
);

SELECT * FROM pg_table LIMIT 100;

-- 2. 表函数
SELECT *
FROM postgresql('pg_host:5432', 'db', 'table', 'user', 'password')
WHERE id > 1000;
```

## 9.4 对象存储 S3

### 9.4.1 读取 S3 数据

```sql
-- 1. 读取 S3 CSV
CREATE TABLE s3_csv
(
    id UInt32,
    name String,
    amount Float64
) ENGINE = S3(
    'https://s3.amazonaws.com/bucket/data.csv',
    'AWS_ACCESS_KEY',
    'AWS_SECRET_KEY',
    'CSV'
);

SELECT * FROM s3_csv;

-- 2. 读取 Parquet（更快）
CREATE TABLE s3_parquet
(
    id UInt32,
    name String,
    amount Float64
) ENGINE = S3(
    'https://s3.amazonaws.com/bucket/data/*.parquet',
    'AWS_ACCESS_KEY',
    'AWS_SECRET_KEY',
    'Parquet'
);

-- 3. 表函数（一次性）
SELECT *
FROM s3(
    'https://s3.amazonaws.com/bucket/data*.csv',
    'AWS_ACCESS_KEY',
    'AWS_SECRET_KEY',
    'CSVWithNames'
)
LIMIT 100;
```

### 9.4.2 写入 S3

```sql
-- 导出查询结果到 S3
INSERT INTO s3(
    'https://s3.amazonaws.com/bucket/export_2024.csv',
    'AWS_ACCESS_KEY',
    'AWS_SECRET_KEY',
    'CSVWithNames'
)
SELECT *
FROM events
WHERE event_date = '2024-01-01';
```

### 9.4.3 S3 磁盘（推荐，冷数据存储）

```xml
<!-- /etc/clickhouse-server/config.d/00-s3.xml -->
<clickhouse>
    <storage_configuration>
        <disks>
            <s3_disk>
                <type>s3</type>
                <endpoint>https://s3.amazonaws.com/bucket/</endpoint>
                <access_key_id>AKIA...</access_key_id>
                <secret_access_key>...</secret_access_key>
                <metadata_path>/var/lib/clickhouse/disks/s3_disk/</metadata_path>
                <cache_enabled>true</cache_enabled>
                <cache_path>/var/lib/clickhouse/disks/s3_cache/</cache_path>
            </s3_disk>
        </disks>

        <policies>
            <s3_storage>
                <volumes>
                    <main>
                        <disk>s3_disk</disk>
                    </main>
                </volumes>
            </s3_storage>
        </policies>
    </storage_configuration>
</clickhouse>
```

```sql
-- 使用 S3 存储
CREATE TABLE events_archive
(
    ...
) ENGINE = MergeTree
ORDER BY ...
SETTINGS storage_policy = 's3_storage';
```

## 9.5 HDFS

```sql
-- 1. 读取 HDFS
CREATE TABLE hdfs_data
(
    id UInt32,
    name String,
    value Float64
) ENGINE = HDFS(
    'hdfs://namenode:8020/data/*.parquet',
    'Parquet'
);

SELECT count() FROM hdfs_data;

-- 2. 写入 HDFS
INSERT INTO hdfs(
    'hdfs://namenode:8020/export/2024-01-01.parquet',
    'Parquet'
)
SELECT * FROM events WHERE event_date = '2024-01-01';
```

## 9.6 JDBC / ODBC（连接其他数据库）

### 9.6.1 JDBC 表函数

```sql
-- 1. 下载 JDBC 驱动
-- clickhouse-client -e "SELECT * FROM jdbc('jdbc:mysql://host:3306/db', 'table')"
-- 需要把 mysql-connector-java.jar 放到 /etc/clickhouse-server/jdbc_drivers/

-- 2. 配置 jdbc_bridge
-- /etc/clickhouse-server/config.d/jdbc.xml
<clickhouse>
    <jdbc_bridge>
        <host>jdbc-bridge-host</host>
        <port>9019</port>
    </jdbc_bridge>
</clickhouse>

-- 3. 查询
SELECT *
FROM jdbc('mysql', 'jdbc:mysql://host:3306/db', 'table')
LIMIT 100;
```

## 9.7 ClickHouse + Grafana

### 9.7.1 安装 Grafana 插件

```bash
grafana-cli plugins install vertamedia-clickhouse-datasource
systemctl restart grafana-server
```

### 9.7.2 配置数据源

```
Type: ClickHouse
URL: http://clickhouse-host:8123
Auth: Basic
User: default
Password: xxx
```

### 9.7.3 实时大屏示例

```sql
-- 1. 每分钟统计
SELECT
    toStartOfMinute(event_time) AS time,
    count() AS qps,
    uniq(user_id) AS uv
FROM events
WHERE event_time >= now() - INTERVAL 1 HOUR
GROUP BY time
ORDER BY time;

-- 2. 关键指标（5 秒刷新）
SELECT
    'Total Events' AS metric,
    count() AS value
FROM events
WHERE event_date = today()
UNION ALL
SELECT 'Unique Users', uniq(user_id) FROM events WHERE event_date = today();
```

## 9.8 编程语言 SDK

### 9.8.1 Python

```python
from clickhouse_driver import Client
import pandas as pd

# 连接
client = Client(
    host='localhost',
    port=9000,
    user='default',
    password='',
    database='default'
)

# 查询
result = client.execute(
    'SELECT event_type, count() FROM events WHERE event_date = %s GROUP BY event_type',
    [('2024-01-01',)]
)

# 插入
data = [
    (1, '2024-01-01 10:00:00', 1001, 'view', 0.0),
    (2, '2024-01-01 10:01:00', 1002, 'click', 0.0),
]
client.execute(
    'INSERT INTO events (id, event_time, user_id, event_type, amount) VALUES',
    data
)

# DataFrame 互转
df = pd.DataFrame(result, columns=['event_type', 'count'])

# 异步
import asyncio
from aioclickhouse_driver import Client

async def query():
    client = await Client.connect(host='localhost', port=9000)
    result = await client.execute("SELECT 1")
    return result
```

### 9.8.2 Java

```java
// pom.xml
<dependency>
    <groupId>com.clickhouse</groupId>
    <artifactId>clickhouse-jdbc</artifactId>
    <version>0.5.0</version>
</dependency>

// 代码
import java.sql.*;

public class ClickHouseExample {
    public static void main(String[] args) throws Exception {
        String url = "jdbc:clickhouse://localhost:8123/default";
        Properties props = new Properties();
        props.setProperty("user", "default");
        props.setProperty("password", "");

        try (Connection conn = DriverManager.getConnection(url, props);
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT version()")) {
            while (rs.next()) {
                System.out.println("Version: " + rs.getString(1));
            }
        }
    }
}
```

### 9.8.3 Go

```go
package main

import (
    "database/sql"
    "fmt"
    _ "github.com/ClickHouse/clickhouse-go/v24"
)

func main() {
    db, err := sql.Open("clickhouse", "clickhouse://default:@localhost:9000/default")
    if err != nil {
        panic(err)
    }
    defer db.Close()

    rows, err := db.Query("SELECT event_type, count() FROM events GROUP BY event_type")
    if err != nil {
        panic(err)
    }
    defer rows.Close()

    for rows.Next() {
        var eventType string
        var count uint64
        if err := rows.Scan(&eventType, &count); err != nil {
            panic(err)
        }
        fmt.Printf("%s: %d\n", eventType, count)
    }
}
```

## 9.9 ETL 工具集成

### 9.9.1 Apache Airflow

```python
from airflow import DAG
from airflow.providers.clickhouse.operators.clickhouse import ClickHouseOperator
from datetime import datetime, timedelta

default_args = {
    'owner': 'airflow',
    'start_date': datetime(2024, 1, 1),
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG('clickhouse_etl', default_args=default_args, schedule_interval='@daily')

etl_task = ClickHouseOperator(
    task_id='daily_etl',
    sql='''
        INSERT INTO dwd.events_clean
        SELECT
            event_id,
            event_date,
            toDateTime(event_time) AS event_time,
            user_id,
            event_type,
            ifNull(amount, 0) AS amount
        FROM ods.events_raw
        WHERE event_date = today() - 1;
    ''',
    clickhouse_conn_id='clickhouse_default',
    dag=dag,
)
```

### 9.9.2 dbt-clickhouse

```yaml
# dbt_project.yml
models:
  my_project:
    materialized: table
    engine: MergeTree
    order_by: (id,)

    clickhouse__materialized: table
    clickhouse__engine: MergeTree
    clickhouse__order_by: (id,)
```

```sql
-- models/events_clean.sql
{{ config(
    materialized='incremental',
    engine='MergeTree',
    order_by='(event_date, user_id)',
    partition_by='toYYYYMM(event_date)'
) }}

SELECT
    event_id,
    event_date,
    event_time,
    user_id,
    event_type,
    amount
FROM {{ source('raw', 'events') }}
{% if is_incremental() %}
WHERE event_date >= today() - 7
{% endif %}
```

## 9.10 总结

✅ **本章要点**：
- 掌握 Kafka、MySQL、PostgreSQL、S3、HDFS 等集成方式
- 理解 MaterializedMySQL、S3 磁盘、JDBC 桥接等高级特性
- 掌握 Python、Java、Go 等 SDK 使用
- 学会 Airflow、dbt 等 ETL 工具集成

📌 **下一步**：进入 [`10-专家进阶`](../10-专家进阶/01-UDF开发.md) 学习高级特性。
