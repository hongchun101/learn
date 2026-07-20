"""Print the curriculum.

Lists every module, its README, and what it adds to the shared
contracts.
"""
from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    src = root / "src" / "db_engine" / "modules"
    rows: list[tuple[str, str]] = []
    for d in sorted(src.iterdir()):
        if d.is_dir() and (d / "README.md").exists():
            first = (d / "README.md").read_text(encoding="utf-8").lstrip().splitlines()[0]
            rows.append((d.name, first.lstrip("# ").strip()))

    print("db-engine-learning curriculum:")
    print()
    for n, t in rows:
        print(f"  {n}: {t}")
    print()
    print(f"Total: {len(rows)} modules.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
