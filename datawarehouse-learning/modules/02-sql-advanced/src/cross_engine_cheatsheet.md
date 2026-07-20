# 跨引擎 SQL 速查

> 当你写了一条 SQL 在一个引擎能跑、另一个引擎报错时，来这里查。

## 字符串拼接

| 引擎 | 语法 |
|---|---|
| DuckDB / Postgres | `'a' \|\| 'b'` |
| Spark SQL | `'a' \|\| 'b'` 或 `concat('a', 'b')` |
| Trino | `'a' \|\| 'b'` 或 `concat('a', 'b')` |
| Hive | `concat('a', 'b')` (无 `\|\|`) |
| Flink | `concat('a', 'b')` |

## 当前时间

| 引擎 | 语法 |
|---|---|
| DuckDB | `now()`, `current_timestamp`, `today()` |
| Spark SQL | `current_timestamp()`, `current_date()` |
| Trino | `current_timestamp`, `current_date` |
| Hive | `current_timestamp()`, `unix_timestamp()` |
| Flink | `current_timestamp`, `current_date` (在流模式下是 processing time) |

## 日期加减

| 引擎 | 语法 |
|---|---|
| DuckDB | `d + INTERVAL 7 DAY`, `d + 7` |
| Spark SQL | `date_add(d, 7)`, `d + INTERVAL 7 DAYS` |
| Trino | `d + INTERVAL '7' DAY` |
| Hive | `date_add(d, 7)`, `d + 7` (按天) |
| Flink | `d + INTERVAL '7' DAY` |

## 类型转换

| 引擎 | 语法 |
|---|---|
| DuckDB | `CAST(x AS INT)`, `x::INT` |
| Spark SQL | `CAST(x AS INT)`, `CAST(x AS BIGINT)` |
| Trino | `CAST(x AS BIGINT)`, `try_cast(x AS BIGINT)` |
| Hive | `CAST(x AS BIGINT)` |
| Flink | `CAST(x AS INT)` |

## 正则

| 引擎 | 语法 |
|---|---|
| DuckDB | `regexp_matches`, `regexp_extract` |
| Spark SQL | `regexp_extract`, `rlike` |
| Trino | `regexp_extract`, `regexp_like` |
| Hive | `regexp_extract`, `rlike` |
| Flink | `REGEXP_EXTRACT` |

## 时间窗口

| 引擎 | 流式 Tumble / Hop / Session |
|---|---|
| Flink SQL | `TUMBLE(ts, INTERVAL '1' HOUR)`, `HOP(...)`, `SESSION(...)` |
| Spark Structured Streaming | `window(ts, '1 hour', '10 minutes')` |
| DuckDB | 仅批式；用 `date_trunc` |

## 物化 / 缓存

| 引擎 | 语法 |
|---|---|
| DuckDB | `CREATE TABLE t AS ...`, `CREATE MATERIALIZED VIEW` (新) |
| Spark SQL | `CREATE TABLE ... AS SELECT`, `CACHE TABLE` |
| Trino | `CREATE TABLE ... AS SELECT`, `CREATE MATERIALIZED VIEW` |
| Hive | `INSERT OVERWRITE TABLE ... SELECT` |
| Flink | `CREATE TABLE ... AS SELECT` (批模式) |

## 函数差异常见坑

| 场景 | DuckDB | Spark | Trino | Hive | Flink |
|---|---|---|---|---|---|
| 取列表第一个 | `list[1]` 或 `(LIST_VALUE(...))[1]` | `array[0]` | `array[1]` 或 `element_at(arr, 1)` | `array[0]` | `array[1]` |
| 时间转字符串 | `strftime(ts, '%Y-%m-%d')` | `date_format(ts, 'yyyy-MM-dd')` | `format_datetime(ts, 'yyyy-MM-dd')` | `from_unixtime(unix_timestamp(ts))` | `DATE_FORMAT(ts, 'yyyy-MM-dd')` |
| 字符串转时间 | `strptime(s, '%Y-%m-%d')` | `to_timestamp(s, 'yyyy-MM-dd')` | `parse_datetime(s, 'yyyy-MM-dd')` | `unix_timestamp(s, 'yyyy-MM-dd')` | `TO_TIMESTAMP(s, 'yyyy-MM-dd')` |
| NULLIF | ✓ | ✓ | ✓ | ✓ | ✓ |
| COALESCE | ✓ | ✓ | ✓ | ✓ | ✓ |
| GREATEST | ✓ | ✓ | ✓ | ✓ | ✓ |
| LEAST | ✓ | ✓ | ✓ | ✓ | ✓ |
| ARRAY_AGG | ✓ | ✓ | ✓ | ✓ (2.x+) | ✓ |
| LISTAGG | ✓ | ✓ | ✓ | `collect_list` + `concat_ws` | ✗ |

## 推荐写"能跨引擎"的 SQL

- 用 `concat(a, b)` 而不是 `a || b`
- 用 `current_timestamp` 而不是 `now()`
- 字符串日期常量用 ISO-8601: `DATE '2024-01-01'`
- 复杂 PIVOT 用 `CASE WHEN + GROUP BY` 而不是 `PIVOT(...)` 关键字
- 时间字段类型在 Hive 优先用 `TIMESTAMP` 而非 `STRING`
