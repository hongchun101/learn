# 01 · How to run

The local build host has `python` 3.12 (no third-party deps required for
modules 01–11). Modules 12+ may pull in optional libs but every module
runs on stdlib alone.

## Install

```bash
python -m pip install -e ".[dev]"
```

## Test everything

```bash
pytest tests/ -v
```

## Per chapter

Every chapter has its own test file. Run any one in isolation:

```bash
pytest tests/modules/test_module_01_storage.py -v
pytest tests/contracts/ -v            # the eight shared contracts
pytest tests/modules/test_module_18_capstone.py -v
```

## Capstone

```bash
python scripts/run_capstone.py
```

This loads a 100 K row TPC-H-lite (NATION, REGION, CUSTOMER, ORDERS,
LINEITEM), runs 8 representative queries end-to-end through the wire
protocol, and prints the wall-clock per stage.

## Verify type and lint cleanliness

```bash
mypy --strict src/db_engine
ruff check src tests
```

## Toolchain table

| Tool | Version expected | Status |
|------|------------------|--------|
| python | 3.11+ | required |
| pytest | 8+ | required for tests |
| hypothesis | 6+ | optional, property tests |
| mypy | 1.10+ | optional, strict typing |
| ruff | 0.5+ | optional, lint |
| orjson, lz4, mmap | — | optional, only used inside stdlib fallback paths |

Everything else is stdlib.
