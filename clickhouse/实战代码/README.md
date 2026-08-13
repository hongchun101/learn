# 实战代码库

这里提供完整的可直接运行的 ClickHouse 示例代码。

## 目录

- `01-quickstart.py`：30 分钟快速上手脚本
- `02-perf-test.sql`：性能压测 SQL
- `03-etl-pipeline.py`：完整 ETL 流程
- `04-monitoring.sql`：监控 SQL
- `05-production-cluster.yml`：生产集群 docker-compose
- `06-backup-restore.sh`：备份恢复脚本

## 01-quickstart.py

```python
#!/usr/bin/env python3
"""
ClickHouse 30 分钟快速上手
运行：python3 01-quickstart.py
"""

from clickhouse_driver import Client
import time
import random

def main():
    # 1. 连接
    client = Client(host='localhost', port=9000, database='default')

    # 2. 创建表
    client.execute('''
        CREATE TABLE IF NOT EXISTS quickstart_events
        (
            event_date Date,
            event_time DateTime,
            user_id UInt64,
            event_type LowCardinality(String),
            amount Decimal(10, 2)
        ) ENGINE = MergeTree
        PARTITION BY toYYYYMM(event_date)
        ORDER BY (event_type, user_id, event_time)
    ''')

    # 3. 批量插入 100 万条
    print("插入 100 万条数据...")
    start = time.time()

    batch_size = 100000
    total = 1000000
    for i in range(0, total, batch_size):
        data = [
            (
                '2024-01-01',
                '2024-01-01 10:00:00',
                random.randint(1, 100000),
                random.choice(['view', 'click', 'purchase', 'add_to_cart']),
                round(random.random() * 1000, 2)
            )
            for _ in range(batch_size)
        ]
        client.execute(
            'INSERT INTO quickstart_events VALUES',
            data
        )
        print(f"  已插入 {i + batch_size}/{total}")

    print(f"插入完成，耗时 {time.time() - start:.2f}s\n")

    # 4. 查询：每个事件类型的统计
    print("统计结果：")
    result = client.execute('''
        SELECT
            event_type,
            count() AS cnt,
            uniqExact(user_id) AS uv,
            round(avg(amount), 2) AS avg_amount
        FROM quickstart_events
        GROUP BY event_type
        ORDER BY cnt DESC
    ''')

    for row in result:
        print(f"  {row[0]}: 数量={row[1]}, UV={row[2]}, 平均金额={row[3]}")

    # 5. 留存分析
    print("\n留存分析：")
    result = client.execute('''
        WITH
            new_users AS (
                SELECT user_id, min(event_date) AS register_date
                FROM quickstart_events
                WHERE event_type = 'purchase'
                GROUP BY user_id
            )
        SELECT
            register_date,
            count() AS new_users,
            countIf(user_id IN (
                SELECT DISTINCT user_id FROM quickstart_events
                WHERE event_date > register_date
            )) AS retained
        FROM new_users
        GROUP BY register_date
    ''')

    for row in result:
        rate = row[2] / row[1] * 100 if row[1] > 0 else 0
        print(f"  日期: {row[0]}, 新增: {row[1]}, 留存: {row[2]} ({rate:.1f}%)")

    # 6. 清理
    client.execute('DROP TABLE IF EXISTS quickstart_events')
    print("\n完成！")

if __name__ == '__main__':
    main()
```

## 02-perf-test.sql

```sql
-- ========================================
-- ClickHouse 性能压测套件
-- ========================================

-- 准备 1 亿行测试数据
DROP TABLE IF EXISTS perf_test;
CREATE TABLE perf_test
(
    id UInt64,
    user_id UInt64,
    event_type LowCardinality(String),
    category LowCardinality(String),
    country LowCardinality(String),
    amount Decimal(18, 2),
    event_date Date,
    event_time DateTime,
    properties Map(String, String)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_type, user_id, event_time);

INSERT INTO perf_test
SELECT
    number AS id,
    number % 1000000 AS user_id,
    arrayElement(['view', 'click', 'purchase', 'add_to_cart', 'favorite'], (number % 5) + 1) AS event_type,
    arrayElement(['electronics', 'clothing', 'food', 'books'], (number % 4) + 1) AS category,
    arrayElement(['CN', 'US', 'JP', 'UK', 'DE'], (number % 5) + 1) AS country,
    round(rand() / 100, 2) AS amount,
    toDate('2024-01-01') + (number % 365) AS event_date,
    toDateTime('2024-01-01 00:00:00') + (number % 86400) AS event_time,
    map('k1', toString(number), 'k2', toString(number * 2)) AS properties
FROM numbers(100000000);

-- ========================================
-- 测试 1：单值查询
-- ========================================
SELECT 'Test 1: 单值查询' AS test;
SELECT count() FROM perf_test WHERE event_type = 'purchase';
-- 期望：< 0.5s

-- ========================================
-- 测试 2：聚合查询
-- ========================================
SELECT 'Test 2: 聚合查询' AS test;
SELECT
    event_type,
    count() AS cnt,
    uniqExact(user_id) AS uv,
    sum(amount) AS total,
    avg(amount) AS avg_amt,
    quantile(0.95)(amount) AS p95
FROM perf_test
WHERE event_date BETWEEN '2024-01-01' AND '2024-01-31'
GROUP BY event_type;
-- 期望：< 1s

-- ========================================
-- 测试 3：复杂查询
-- ========================================
SELECT 'Test 3: 复杂查询' AS test;
SELECT
    country,
    event_type,
    count() AS cnt,
    uniqExact(user_id) AS uv
FROM perf_test
WHERE event_date >= '2024-06-01'
  AND amount > 50
  AND properties['k1'] != ''
GROUP BY country, event_type
ORDER BY cnt DESC
LIMIT 100;
-- 期望：< 2s

-- ========================================
-- 测试 4：JOIN 查询
-- ========================================
SELECT 'Test 4: 字典 JOIN' AS test;
-- 创建字典
CREATE DICTIONARY IF NOT EXISTS country_dict
(
    country_code String,
    country_name String
)
PRIMARY KEY country_code
SOURCE(CLICKHOUSE(DB 'default' TABLE 'perf_test'))
LIFETIME(MIN 300 MAX 600)
LAYOUT(HASHED());

SELECT
    country,
    dictGet('country_dict', 'country_name', country) AS name,
    count() AS cnt
FROM perf_test
WHERE event_date = '2024-01-01'
GROUP BY country, name;
-- 期望：< 1s

-- ========================================
-- 测试 5：窗口函数
-- ========================================
SELECT 'Test 5: 窗口函数' AS test;
SELECT
    user_id,
    event_time,
    amount,
    sum(amount) OVER (PARTITION BY user_id ORDER BY event_time) AS cumulative
FROM perf_test
WHERE user_id < 100
ORDER BY user_id, event_time;
-- 期望：< 1s

-- ========================================
-- 测试 6：实时查询（带过滤的扫描）
-- ========================================
SELECT 'Test 6: 实时查询' AS test;
SELECT
    toStartOfHour(event_time) AS hour,
    count() AS cnt,
    uniqExact(user_id) AS uv
FROM perf_test
WHERE event_time >= now() - INTERVAL 1 DAY
GROUP BY hour;
-- 期望：< 1s
```

## 03-etl-pipeline.py

```python
#!/usr/bin/env python3
"""
完整 ETL 流程示例
从 MySQL → ClickHouse 数据同步
"""

from clickhouse_driver import Client
import pymysql
import time
from datetime import datetime, timedelta

CLICKHOUSE_CONFIG = {
    'host': 'localhost',
    'port': 9000,
    'database': 'dwd'
}

MYSQL_CONFIG = {
    'host': 'mysql-host',
    'port': 3306,
    'user': 'etl_user',
    'password': 'etl_password',
    'database': 'source_db'
}

BATCH_SIZE = 50000

def extract_from_mysql(last_sync_time):
    """从 MySQL 增量抽取"""
    print(f"从 MySQL 抽取数据（更新时间 >= {last_sync_time}）...")

    conn = pymysql.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(pymysql.cursors.SSDictCursor)

    sql = '''
        SELECT id, user_id, amount, status, created_at, updated_at
        FROM orders
        WHERE updated_at >= %s
        ORDER BY updated_at ASC
        LIMIT %s
    '''

    cursor.execute(sql, (last_sync_time, BATCH_SIZE))

    batch = []
    for row in cursor:
        batch.append(row)
    conn.close()

    print(f"  抽取 {len(batch)} 行")
    return batch

def transform(rows):
    """数据转换"""
    print("数据转换中...")
    transformed = []
    for row in rows:
        # 字段映射、清洗
        transformed.append((
            row['id'],
            row['user_id'],
            float(row['amount']),
            row['status'].strip() if row['status'] else 'unknown',
            row['created_at'],
            row['updated_at'],
            # 业务计算
            float(row['amount']) * 0.9 if row['status'] == 'paid' else 0,
            # 衍生字段
            'high' if row['amount'] > 1000 else 'low',
            datetime.now()  # ETL 时间
        ))
    return transformed

def load_to_clickhouse(rows):
    """加载到 ClickHouse"""
    if not rows:
        return

    print(f"加载 {len(rows)} 行到 ClickHouse...")
    client = Client(**CLICKHOUSE_CONFIG)

    # 批量插入
    client.execute(
        '''INSERT INTO dwd.orders
           (id, user_id, amount, status, created_at, updated_at, paid_amount, amount_level, etl_time)
           VALUES''',
        rows
    )

    client.disconnect()

def run_etl():
    """主流程"""
    last_sync_time = datetime.now() - timedelta(hours=1)

    total = 0
    start = time.time()

    while True:
        # 抽取
        rows = extract_from_mysql(last_sync_time)
        if not rows:
            break

        # 转换
        transformed = transform(rows)

        # 加载
        load_to_clickhouse(transformed)

        total += len(rows)

        # 更新游标
        last_sync_time = rows[-1]['updated_at']

        print(f"已同步 {total} 行")

    print(f"\nETL 完成：共 {total} 行，耗时 {time.time() - start:.2f}s")

if __name__ == '__main__':
    run_etl()
```

## 04-monitoring.sql

```sql
-- ========================================
-- ClickHouse 监控 SQL
-- ========================================

-- 1. 总体状态
SELECT
    'Service Status' AS metric,
    version() AS value
UNION ALL
SELECT 'Uptime', uptime()
UNION ALL
SELECT 'Memory Usage', formatReadableSize(memoryUsage())
UNION ALL
SELECT 'Active Queries',
    (SELECT count() FROM system.processes WHERE type = 'Query')
UNION ALL
SELECT 'Total Tables',
    (SELECT count() FROM system.tables WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA'));

-- 2. 慢查询 Top 20
SELECT
    formatDateTime(event_time, '%Y-%m-%d %H:%M:%S') AS time,
    user,
    query_duration_ms / 1000 AS duration_sec,
    formatReadableSize(memory_usage) AS memory,
    formatReadableSize(read_bytes) AS read_size,
    read_rows AS rows,
    substring(query, 1, 200) AS query_preview
FROM system.query_log
WHERE type > 1
  AND event_time >= now() - INTERVAL 1 HOUR
  AND query_duration_ms > 1000
ORDER BY query_duration_ms DESC
LIMIT 20;

-- 3. 用户查询量
SELECT
    user,
    count() AS total_queries,
    countIf(query_duration_ms > 1000) AS slow_queries,
    countIf(type = 'ExceptionWhileProcessing') AS error_queries,
    round(avg(query_duration_ms), 2) AS avg_ms,
    round(quantile(0.95)(query_duration_ms), 2) AS p95_ms
FROM system.query_log
WHERE type > 1
  AND event_time >= now() - INTERVAL 1 HOUR
GROUP BY user
ORDER BY total_queries DESC;

-- 4. 表的 Part 数量
SELECT
    database,
    table,
    count() AS part_count,
    sum(rows) AS total_rows,
    formatReadableSize(sum(bytes_on_disk)) AS total_size,
    min(min_time) AS oldest,
    max(max_time) AS newest,
    -- 距最近合并的秒数
    max(ModificationTime) AS last_modification
FROM system.parts
WHERE active
  AND database NOT IN ('system')
GROUP BY database, table
HAVING part_count > 100  -- 只看异常多的
ORDER BY part_count DESC
LIMIT 20;

-- 5. 副本状态
SELECT
    database,
    table,
    replica_name,
    absolute_delay,
    queue_size,
    inserts_in_queue,
    merges_in_queue
FROM system.replicas
WHERE database NOT IN ('system')
ORDER BY absolute_delay DESC;

-- 6. 磁盘使用
SELECT
    name,
    path,
    type,
    formatReadableSize(free_space) AS free,
    formatReadableSize(total_space) AS total,
    round(total_space / (total_space + free_space) * 100, 2) AS used_pct
FROM system.disks
ORDER BY used_pct DESC;

-- 7. 内存使用
SELECT
    metric,
    formatReadableSize(value) AS value,
    description
FROM system.metrics
WHERE metric LIKE '%Memory%' OR metric LIKE '%Cache%'
ORDER BY value DESC;
```

## 05-production-cluster.yml

```yaml
# docker-compose.yml - 生产级 ClickHouse 集群
version: '3.8'

services:
  # ZooKeeper
  zookeeper1:
    image: zookeeper:3.8
    hostname: zookeeper1
    ports:
      - "2181:2181"
    environment:
      ZOO_MY_ID: 1
      ZOO_SERVERS: server.1=zookeeper1:2888:3888;2181 server.2=zookeeper2:2888:3888;2181 server.3=zookeeper3:2888:3888;2181
    volumes:
      - zk1-data:/data
      - zk1-log:/datalog

  zookeeper2:
    image: zookeeper:3.8
    hostname: zookeeper2
    ports:
      - "2182:2181"
    environment:
      ZOO_MY_ID: 2
      ZOO_SERVERS: server.1=zookeeper1:2888:3888;2181 server.2=zookeeper2:2888:3888;2181 server.3=zookeeper3:2888:3888;2181
    volumes:
      - zk2-data:/data
      - zk2-log:/datalog

  zookeeper3:
    image: zookeeper:3.8
    hostname: zookeeper3
    ports:
      - "2183:2181"
    environment:
      ZOO_MY_ID: 3
      ZOO_SERVERS: server.1=zookeeper1:2888:3888;2181 server.2=zookeeper2:2888:3888;2181 server.3=zookeeper3:2888:3888;2181
    volumes:
      - zk3-data:/data
      - zk3-log:/datalog

  # ClickHouse Shard 1
  clickhouse-shard1-01:
    image: clickhouse/clickhouse-server:24.3
    hostname: clickhouse-shard1-01
    ports:
      - "9000:9000"
      - "8123:8123"
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    volumes:
      - ./config/clickhouse/config.xml:/etc/clickhouse-server/config.xml
      - ./config/clickhouse/macros.xml:/etc/clickhouse-server/config.d/macros.xml
      - ./data/shard1-01:/var/lib/clickhouse
    depends_on:
      - zookeeper1
      - zookeeper2
      - zookeeper3

  clickhouse-shard1-02:
    image: clickhouse/clickhouse-server:24.3
    hostname: clickhouse-shard1-02
    ports:
      - "9001:9000"
      - "8124:8123"
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    volumes:
      - ./config/clickhouse/config.xml:/etc/clickhouse-server/config.xml
      - ./config/clickhouse/macros-shard1-02.xml:/etc/clickhouse-server/config.d/macros.xml
      - ./data/shard1-02:/var/lib/clickhouse
    depends_on:
      - zookeeper1
      - zookeeper2
      - zookeeper3

  # 监控
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml

  clickhouse-exporter:
    image: flant/clickhouse-exporter:latest
    ports:
      - "9116:9116"
    environment:
      CLICKHOUSE_URL: http://clickhouse-shard1-01:8123

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana-data:/var/lib/grafana

volumes:
  zk1-data:
  zk1-log:
  zk2-data:
  zk2-log:
  zk3-data:
  zk3-log:
  grafana-data:
```

## 06-backup-restore.sh

```bash
#!/bin/bash
# ClickHouse 备份恢复脚本
set -e

BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
S3_BUCKET="my-clickhouse-backups"
LOCAL_BACKUP_DIR="/var/backups/clickhouse"

# 配置
CLICKHOUSE_HOST="localhost"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD=""

# ========================================
# 1. 完整备份
# ========================================
backup_full() {
    echo "开始完整备份：$BACKUP_NAME"
    clickhouse-backup create $BACKUP_NAME
    clickhouse-backup upload $BACKUP_NAME --s3-bucket=$S3_BUCKET
    echo "备份完成"
}

# ========================================
# 2. 增量备份
# ========================================
backup_incremental() {
    echo "开始增量备份"
    LAST_BACKUP=$(clickhouse-backup list local --plain | tail -1 | awk '{print $1}')
    if [ -n "$LAST_BACKUP" ]; then
        clickhouse-backup create --diff-from=$LAST_BACKUP incr_$BACKUP_NAME
        clickhouse-backup upload incr_$BACKUP_NAME --s3-bucket=$S3_BUCKET
    else
        echo "无上次备份，执行完整备份"
        backup_full
    fi
}

# ========================================
# 3. 恢复
# ========================================
restore() {
    local backup=$1
    if [ -z "$backup" ]; then
        echo "用法：$0 restore <backup_name>"
        exit 1
    fi

    echo "从 $backup 恢复"
    clickhouse-backup download $backup --s3-bucket=$S3_BUCKET
    clickhouse-backup restore $backup
    echo "恢复完成"
}

# ========================================
# 4. 列出备份
# ========================================
list_backups() {
    echo "本地备份："
    clickhouse-backup list local
    echo ""
    echo "远程备份："
    clickhouse-backup list remote --s3-bucket=$S3_BUCKET
}

# ========================================
# 5. 清理旧备份
# ========================================
cleanup() {
    local keep=${1:-7}
    echo "保留最近 $keep 个备份"
    clickhouse-backup delete local --keep=$keep
    clickhouse-backup delete remote --s3-bucket=$S3_BUCKET --keep=$keep
}

# ========================================
# 主入口
# ========================================
case "$1" in
    full)        backup_full ;;
    incr)        backup_incremental ;;
    restore)     restore "$2" ;;
    list)        list_backups ;;
    cleanup)     cleanup "$2" ;;
    *)
        echo "用法：$0 {full|incr|restore|list|cleanup}"
        exit 1
        ;;
esac
```

## Kafka 集成完整示例

```python
# kafka_to_clickhouse.py
"""
Kafka 实时数据写入 ClickHouse
"""

from clickhouse_driver import Client
from kafka import KafkaConsumer
import json
import time

KAFKA_BROKERS = ['kafka1:9092', 'kafka2:9092']
KAFKA_TOPIC = 'user_events'
CONSUMER_GROUP = 'clickhouse_consumer'

CLICKHOUSE_HOST = 'localhost'
CLICKHOUSE_PORT = 9000
CLICKHOUSE_DB = 'ods'

BATCH_SIZE = 10000
FLUSH_INTERVAL = 5  # 秒

def main():
    # Kafka 消费者
    consumer = KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BROKERS,
        group_id=CONSUMER_GROUP,
        auto_offset_reset='earliest',
        enable_auto_commit=False,
        value_deserializer=lambda x: json.loads(x.decode('utf-8'))
    )

    # ClickHouse 连接
    client = Client(host=CLICKHOUSE_HOST, port=CLICKHOUSE_PORT, database=CLICKHOUSE_DB)

    # 预编译 SQL
    insert_sql = '''
        INSERT INTO ods.user_events
        (event_id, event_time, user_id, event_type, amount, properties)
        VALUES
    '''

    batch = []
    last_flush = time.time()

    print(f"开始消费 {KAFKA_TOPIC}...")

    for message in consumer:
        try:
            data = message.value

            # 转换
            row = (
                data['event_id'],
                data['event_time'],
                data['user_id'],
                data['event_type'],
                float(data.get('amount', 0)),
                data.get('properties', {})
            )
            batch.append(row)

            # 批量刷盘
            if len(batch) >= BATCH_SIZE or (time.time() - last_flush) >= FLUSH_INTERVAL:
                client.execute(insert_sql, batch)
                consumer.commit()
                print(f"  已写入 {len(batch)} 条，累计 {message.offset}")

                batch = []
                last_flush = time.time()

        except Exception as e:
            print(f"处理失败：{e}")
            continue

if __name__ == '__main__':
    main()
```

## Grafana 大屏配置

```json
{
  "dashboard": {
    "title": "ClickHouse Real-time Dashboard",
    "panels": [
      {
        "title": "QPS",
        "type": "graph",
        "targets": [
          {
            "query": "SELECT toStartOfSecond(event_time) AS t, count() AS qps FROM events WHERE event_time >= now() - 60 GROUP BY t ORDER BY t"
          }
        ]
      },
      {
        "title": "Latency P99",
        "type": "stat",
        "targets": [
          {
            "query": "SELECT quantile(0.99)(latency_ms) FROM request_logs WHERE event_time >= now() - 60"
          }
        ]
      },
      {
        "title": "Active Users",
        "type": "stat",
        "targets": [
          {
            "query": "SELECT uniq(user_id) FROM events WHERE event_time >= now() - 60"
          }
        ]
      }
    ]
  }
}
```
