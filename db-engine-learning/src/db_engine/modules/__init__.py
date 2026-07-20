"""db_engine.modules — the 18 chapters.

Every chapter is a small Python package. The narrative is in
`chapter.py`. Code lives alongside it. Tests live in
`db_engine.tests.modules.test_module_NN_*`.
"""
from __future__ import annotations

# Modules are registered on import. Use lazy to keep startup fast.
_LAZY = {
    "01_storage": "db_engine.modules.module_01_storage",
    "02_wal": "db_engine.modules.module_02_wal",
    "03_mvcc": "db_engine.modules.module_03_mvcc",
    "04_parser": "db_engine.modules.module_04_parser",
    "05_planner": "db_engine.modules.module_05_planner",
    "06_executor": "db_engine.modules.module_06_executor",
    "07_joins": "db_engine.modules.module_07_joins",
    "08_cbo": "db_engine.modules.module_08_cbo",
    "09_indexes": "db_engine.modules.module_09_indexes",
    "10_vectorized": "db_engine.modules.module_10_vectorized",
    "11_parallel": "db_engine.modules.module_11_parallel",
    "12_distributed": "db_engine.modules.module_12_distributed",
    "13_columnar": "db_engine.modules.module_13_columnar",
    "14_olap": "db_engine.modules.module_14_olap",
    "15_codegen": "db_engine.modules.module_15_codegen",
    "16_observability": "db_engine.modules.module_16_observability",
    "17_wire": "db_engine.modules.module_17_wire",
    "18_capstone": "db_engine.modules.module_18_capstone",
}


def __getattr__(name: str):
    if name in _LAZY:
        import importlib
        return importlib.import_module(_LAZY[name])
    raise AttributeError(name)
