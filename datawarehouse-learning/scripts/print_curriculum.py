"""Print the curriculum as a Markdown table."""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES = ROOT / "modules"

MODULES_ORDER = [
    ("01", "数仓基础概念与理论"),
    ("02", "关系型数据库与 SQL 进阶"),
    ("03", "Linux / Python 数据工程基础"),
    ("04", "Hadoop / HDFS / YARN 生态"),
    ("05", "Hive 数仓建设"),
    ("06", "Spark SQL 与 Spark 离线数仓"),
    ("07", "离线数仓分层 (ODS/DWD/DWS/ADS) 与维度建模"),
    ("08", "调度系统 (Airflow / DolphinScheduler)"),
    ("09", "Kafka 消息队列与数据接入"),
    ("10", "Flink 基础与 DataStream API"),
    ("11", "Flink SQL 与 Flink CDC"),
    ("12", "实时数仓分层架构 (Lambda / Kappa / 湖仓)"),
    ("13", "数据湖 (Iceberg / Hudi / Delta / Paimon)"),
    ("14", "OLAP 引擎 (Trino / ClickHouse / Doris / StarRocks)"),
    ("15", "数据质量管理"),
    ("16", "元数据管理与数据安全"),
    ("17", "性能调优与成本优化"),
    ("18", "专家综合实战"),
]


def first_heading(text: str) -> str:
    for line in text.splitlines():
        m = re.match(r"^#\s+(.+)$", line)
        if m:
            return m.group(1).strip()
    return "(no title)"


def read_subtitle(path: Path) -> str:
    """Pick the first paragraph after the H1, up to 80 chars."""
    lines = path.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        if line.startswith("# "):
            for nxt in lines[i + 1 : i + 10]:
                nxt = nxt.strip()
                if not nxt or nxt.startswith("#") or nxt.startswith(">"):
                    continue
                return nxt[:80] + ("…" if len(nxt) > 80 else "")
            return ""
    return ""


def main() -> None:
    rows = []
    for num, title in MODULES_ORDER:
        d = MODULES / f"{num}-*"
        matches = list(MODULES.glob(f"{num}-*"))
        if not matches:
            rows.append([num, title, "—", "—"])
            continue
        readme = matches[0] / "README.md"
        if readme.exists():
            sub = read_subtitle(readme)
        else:
            sub = "(no README)"
        # detect test files
        tests = list(matches[0].rglob("test_*.py"))
        rows.append([num, title, sub, f"{len(tests)} test file(s)"])
    # Print as markdown table
    print("| # | Module | One-line | Tests |")
    print("|---|---|---|---|")
    for r in rows:
        print(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} |")
    print()
    print(f"Total: {len(rows)} modules.")


if __name__ == "__main__":
    main()
