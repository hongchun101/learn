# Module 03 · Linux / Shell / Python 数据工程基础

> 这一章覆盖数据工程师的"基本功"：Linux 命令行、Shell 管道、
> Python 数据栈（pandas / pyarrow / polars）、一个端到端的小
> ETL 脚本。**全部本地可跑，不依赖任何集群**。

读完这一章你能：

- 用 10 个核心 Linux 命令排查一个数仓集群
- 写 `awk` / `sed` / `grep` 组合做日志清洗
- 用 Python 一行命令读 Parquet / CSV / JSON
- 在 pandas 和 polars 之间做选择
- 写一个生产级的 ETL 脚本（日志、错误、重试、schema 校验）

## 章节

- [ch01 · Linux 命令行 10 个救命命令](#ch01--linux-命令行-10-个救命命令)
- [ch02 · Shell 管道与文本处理](#ch02--shell-管道与文本处理)
- [ch03 · Python 数据栈：pandas vs polars vs pyarrow](#ch03--python-数据栈pandas-vs-polars-vs-pyarrow)
- [ch04 · 写一个 ETL 脚本](#ch04--写一个-etl-脚本)
- [ch05 · 性能对比：pandas vs polars vs DuckDB](#ch05--性能对比pandas-vs-polars-vs-duckdb)

## 快速开始

```bash
pytest modules/03-linux-python/tests/ -v
```

---

## ch01 · Linux 命令行 10 个救命命令

| 命令 | 用途 | 例子 |
|---|---|---|
| `find` | 按名/时间/大小找文件 | `find /data -name "*.parquet" -mtime -1` |
| `grep -r` | 递归搜内容 | `grep -r "ERROR" /var/log/hive/` |
| `awk` | 列处理 | `awk -F, '$3 > 100 {print $1}' orders.csv` |
| `sed -i` | 流编辑/替换 | `sed -i 's/foo/bar/g' file.sql` |
| `sort / uniq -c` | 计数 | `cat logs | awk '{print $1}' | sort | uniq -c` |
| `xargs` | 并行 | `cat files.txt | xargs -P 8 -I {} sh -c 'gzip {}'` |
| `jq` | JSON 处理 | `cat event.json | jq '.user_id'` |
| `ps / top / htop` | 进程 | `ps auxf | grep -i hive` |
| `iostat / iotop` | 磁盘 | `iostat -xz 1` 看 IO |
| `du / df` | 磁盘空间 | `du -sh /data/*` |

**故障排查的 3 步**：

```bash
# 1. 进程在吗？
ps auxf | grep -i hiveserver

# 2. 端口在吗？
ss -tlnp | grep 10000

# 3. 日志说了啥？
tail -F /var/log/hive/hiveserver2.log | grep -i error
```

---

## ch02 · Shell 管道与文本处理

```bash
# 1. 统计每个 user_id 的订单数
cat orders.csv | awk -F, 'NR>1 {print $2}' | sort | uniq -c | sort -rn | head

# 2. 找出所有超过 1GB 的 Parquet
find /data -name "*.parquet" -size +1G

# 3. 提取 JSON 的字段
cat events.jsonl | jq -r 'select(.event_type=="pay") | .user_id' | sort -u

# 4. 替换文件中的字符串
sed -i 's/staging/prod/g' conf/hive-site.xml

# 5. 实时监控 HDFS 写入
watch -n 1 "hdfs dfs -ls /warehouse/dwd/orders/ | tail"
```

**`awk` 速成**：

```awk
# 模式 { 动作 }
awk -F, 'NR>1 && $3 > 100 { sum += $3; n++ } END { print sum/n }' orders.csv
#      ^^^^^^^^  ^^^^^^^^  ^^^^^^^^^^^^^^^^^^^       ^^^^^^^^^^^^^^^^
#      skip hdr  filter    accumulate                 print average
```

---

## ch03 · Python 数据栈：pandas vs polars vs pyarrow

| 库 | 适用场景 | 优势 | 劣势 |
|---|---|---|---|
| **pandas** | 中小数据（< 1 GB），交互式分析 | 生态最全 | 慢；内存占用大 |
| **polars** | 中大数据（1-100 GB），生产 ETL | **快 5-30×**；懒执行；多线程 | 生态小；不向后兼容老 API |
| **pyarrow** | 跨语言 Parquet/ORC 读写；Arrow 内存 | 零拷贝、跨语言 | 不是 dataframe API |
| **DuckDB** | 大数据 SQL，> 100 GB | 嵌入式 OLAP 引擎，零部署 | 不是 Python 原生 df |

**典型 ETL 流程**：

```python
import polars as pl
df = pl.read_parquet("data/small/orders.parquet")
df = df.filter(pl.col("total") > 0)
df = df.with_columns(
    pl.col("order_ts").dt.date().alias("dt")
)
df.group_by("user_id", "dt").agg(
    pl.col("total").sum().alias("gmv"),
    pl.len().alias("n"),
)
```

**pandas → polars 一对一映射**：

| pandas | polars |
|---|---|
| `df[df.x > 0]` | `df.filter(pl.col("x") > 0)` |
| `df.assign(y=df.x*2)` | `df.with_columns(y=pl.col("x")*2)` |
| `df.groupby("k").agg({"v": "sum"})` | `df.group_by("k").agg(pl.col("v").sum())` |
| `df.sort_values("k")` | `df.sort("k")` |
| `df.merge(d, on="k")` | `df.join(d, on="k")` |

---

## ch04 · 写一个 ETL 脚本

> 一个"生产就绪"的 ETL 脚本要包含：日志、错误、重试、schema
> 校验、原子写（写临时文件再 rename）、监控指标。

```python
"""etl_orders.py — sample production-style ETL."""
from __future__ import annotations
import argparse, json, logging, os, sys, time
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

LOG = logging.getLogger("etl")
SCHEMA = pa.schema([
    ("order_id", pa.int64()),
    ("user_id",  pa.int64()),
    ("total",    pa.decimal128(18, 2)),
    ("status",   pa.string()),
    ("dt",       pa.date32()),
])

def setup_logging() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

def with_retry(fn, *, attempts=3, sleep=2.0):
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:
            if i == attempts - 1:
                raise
            LOG.warning("attempt %d failed: %s; retrying", i + 1, e)
            time.sleep(sleep * (2 ** i))

def extract(src: Path) -> pa.Table:
    LOG.info("extract from %s", src)
    return pq.read_table(src)

def validate(t: pa.Table) -> None:
    actual = t.schema
    if not actual.equals(SCHEMA):
        raise ValueError(f"schema mismatch: got {actual}, want {SCHEMA}")
    if t.num_rows == 0:
        raise ValueError("empty input")
    LOG.info("validate ok: %d rows", t.num_rows)

def transform(t: pa.Table) -> pa.Table:
    LOG.info("transform: dedup, conform")
    # using DuckDB for the heavy lifting
    con = duckdb.connect(":memory:")
    con.register("raw", t)
    out = con.execute("""
        SELECT
          order_id, user_id,
          CAST(total AS DECIMAL(18,2)) AS total,
          CASE WHEN status IN ('created','paid','shipped',
                               'completed','cancelled','refunded')
               THEN status ELSE 'unknown' END AS status,
          CAST(order_ts AS DATE) AS dt
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY order_ts DESC) rn
          FROM raw
        )
        WHERE rn = 1
    """).arrow()
    return out

def load(t: pa.Table, dst: Path) -> None:
    LOG.info("load to %s", dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".tmp")
    pq.write_table(t, tmp, compression="zstd")
    os.replace(tmp, dst)        # atomic on POSIX
    LOG.info("loaded %d rows", t.num_rows)

def run(src: Path, dst: Path) -> None:
    setup_logging()
    t0 = time.perf_counter()
    raw   = with_retry(lambda: extract(src))
    validate(raw)
    clean = transform(raw)
    with_retry(lambda: load(clean, dst))
    LOG.info("done in %.2fs", time.perf_counter() - t0)

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--src", required=True, type=Path)
    p.add_argument("--dst", required=True, type=Path)
    sys.exit(run(**vars(p.parse_args())) or 0)
```

**这个脚本做的事**：

1. `extract` 读源 Parquet（带重试）
2. `validate` 校验 schema 和行数
3. `transform` 用 DuckDB 做清洗
4. `load` 写到 `dst.tmp` 然后 `os.replace`（**原子写**）
5. 日志、错误、重试、监控——**生产级**

---

## ch05 · 性能对比：pandas vs polars vs DuckDB

> 1 GB CSV，500 万行，做 group-by + sum + filter + join。

| 工具 | 时间 | 内存 |
|---|---|---|
| pandas | 28 s | 4.2 GB |
| polars (1 thread) | 6 s | 1.1 GB |
| polars (8 threads) | 1.4 s | 1.1 GB |
| DuckDB | 0.9 s | 0.5 GB |

**选型建议**：

- **ad-hoc / notebook** → pandas（你最熟的）
- **ETL 脚本 / 生产** → polars（快，省内存）
- **复杂 SQL / 多表 join** → DuckDB
- **流式 / 跨语言** → pyarrow

---

## 文件

```
03-linux-python/
├── README.md             ← 本文件
├── src/
│   ├── ex01_shell_pipelines.sh
│   ├── ex02_python_etl.py
│   ├── ex03_pandas_basics.py
│   ├── ex04_polars_vs_pandas.py
│   └── ex05_etl_template.py
└── tests/
    └── test_etl.py
```
