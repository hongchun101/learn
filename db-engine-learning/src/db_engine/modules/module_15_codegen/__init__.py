"""Module 15 — query compilation.

Turn an AST expression into Python bytecode (i.e. a compiled
function). The hot loop of the executor now runs a real fn.

Real engines compile into C/LLVM (DuckDB, HyPer). Python
`compile()` is a useful stand-in: the boundary you cross is the
same — the executor stops calling the AST walker and starts
calling compiled code.
"""
from __future__ import annotations

import dis
import types
from typing import Any


def compile_predicate(expr_src: str, argname: str = "row") -> types.CodeType:
    """Compile a single boolean expression to Python bytecode.

    `expr_src` is a Python expression evaluating to bool. The
    resulting code object takes one argument (`row`) and returns
    the bool.
    """
    src = f"def _expr({argname}):\n    return ({expr_src})\n"
    code = compile(src, "<predicate>", "exec")
    return code.co_consts[0]  # the function code object


def make_predicate(expr_src: str, argname: str = "row") -> Any:
    code = compile_predicate(expr_src, argname)
    fn = types.FunctionType(code, globals())
    return fn


def compile_full_predicate(columns: list[str], op: str, value: Any) -> types.FunctionType:
    """A small templated predicate compiler.

    `columns[0] op value` becomes a one-line function `row[col_idx] op value`.
    """
    if len(columns) != 1:
        raise ValueError("exactly one column supported")
    src = f"def _p(row, _idx={columns[0]!r}, _v={value!r}):\n    return row[_idx] {_op_for(op)} _v\n"
    code = compile(src, "<op_pred>", "exec")
    fn = types.FunctionType(code.co_consts[0], {"_op_for": lambda op: op}, "__main__")  # type: ignore[arg-type]
    return fn


def _op_for(op: str) -> str:
    return {"eq": "==", "ne": "!=", "lt": "<", "le": "<=", "gt": ">", "ge": ">="}[op]


def run_demo() -> dict:
    fn = make_predicate("row[0] > 10")
    out = [fn([5, 1]), fn([20, 1]), fn([10, 1])]
    return {
        "results": out,
        "bytecode_lines": list(dis.get_instructions(fn))[:5],
    }


__all__ = ["compile_predicate", "make_predicate", "compile_full_predicate", "run_demo"]
