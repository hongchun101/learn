"""Run every available demo in the curriculum and report.

Walks every module's src/ directory and runs each .py or .sql file.
Reports which demos ran successfully, which failed, and the time
each took.

Run:
    python scripts/run_all_demos.py
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable


def run(cmd: list[str], timeout: int = 120) -> tuple[int, str]:
    try:
        cp = subprocess.run(
            cmd, cwd=str(ROOT), capture_output=True,
            text=True, timeout=timeout, env={"PATH": "/usr/bin:/bin"},
        )
        return cp.returncode, (cp.stdout + cp.stderr)[-500:]
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT"
    except Exception as e:
        return 1, str(e)


def main() -> int:
    modules = sorted((ROOT / "modules").glob("[0-9][0-9]-*"))
    if not modules:
        print("no modules found")
        return 1

    pass_, fail = 0, 0
    for m in modules:
        for f in sorted(m.glob("src/*.py")):
            t0 = time.perf_counter()
            rc, out = run([PY, str(f.relative_to(ROOT))])
            dt = time.perf_counter() - t0
            mark = "OK " if rc == 0 else "FAIL"
            print(f"  [{mark}] {f.relative_to(ROOT):60s} {dt:6.1f}s")
            if rc == 0:
                pass_ += 1
            else:
                fail += 1
                print(f"        {out[:300]}")
        for f in sorted(m.glob("src/*.sql")):
            t0 = time.perf_counter()
            # run with duckdb
            rc, out = run(["duckdb", "-c", f.read_text(encoding="utf-8")])
            dt = time.perf_counter() - t0
            mark = "OK " if rc == 0 else "FAIL"
            print(f"  [{mark}] {f.relative_to(ROOT):60s} {dt:6.1f}s")
            if rc == 0:
                pass_ += 1
            else:
                fail += 1
                print(f"        {out[:300]}")
    print()
    print(f"Total: {pass_} passed, {fail} failed")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
