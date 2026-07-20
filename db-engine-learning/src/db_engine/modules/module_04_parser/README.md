# Module 04 — SQL parser

## What you'll learn

The parser converts SQL text into an AST. The AST is the *contract*
between the user and the planner: every later chapter reads the
AST, never SQL.

By the end of this chapter you can:

- lex a SQL string into a token stream;
- write a recursive-descent parser for a useful subset;
- produce an AST that downstream code can pattern-match without
  re-parsing.

## Files

```
module_04_parser/
  lexer.py       # Token, TokenKind, lex()
  ast_nodes.py   # Expr, Select, Insert, CreateTable, Ast
  parser.py      # SqlParser
  chapter.py     # the demo + run_demo()
```

## How to run

```python
from db_engine.modules.module_04_parser.chapter import run_demo
print(run_demo())
```

## Tests

```
tests/modules/test_module_04_parser.py
```

Asserts:

1. `lex("SELECT 1;")` returns three tokens + EOF.
2. `SqlParser("...").parse()` produces a `Select` with the expected
   column list.
3. INSERT and CREATE TABLE parse to the right AST shape.
4. The WHERE expression tree is left-associative.

## What an expert can do after this module

- [ ] Draw the recursive-descent call graph for SELECT.
- [ ] Explain why we separate `COMPARE` from `BINOP` (predicates vs
      arithmetic).
- [ ] Add `BETWEEN`, `LIKE`, `IN`, `IS NULL` (curriculum exercises).
- [ ] Diagnose why precedence bugs are subtle (look at `_parse_compare`).

## Going deeper

- See chapter 15 for compilation of `Expr` directly to bytecode.
- See chapter 05 for AST → logical plan translation.
