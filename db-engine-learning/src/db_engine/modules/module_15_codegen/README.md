# Module 15 — Query compilation

## What you'll learn

A volcano executor walks the AST at every row. A compiled
predicate removes that indirection: the hot loop becomes a flat
function with no virtual calls.

After this chapter you can:

- explain why compilation beats interpretation for hot paths;
- use Python's `compile` and `dis` to inspect bytecode;
- decide between expression templates and full AST→IR
  translation.

## Files

```
module_15_codegen/
  __init__.py     # everything
```

## Tests

```
tests/modules/test_module_15_codegen.py
```

1. `compile_predicate("row[0] > 10")` produces a fn that returns
   True/False correctly.
2. `dis.get_instructions` shows the bytecode is the inline compare,
   not a call to `eval_expr`.

## Going deeper

- See HyPer (Neumann/Freitag) for the original compiled query idea.
- See DuckDB's execution layer for vectorized + JIT today.
