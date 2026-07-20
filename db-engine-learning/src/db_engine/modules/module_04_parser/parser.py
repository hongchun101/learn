"""Recursive-descent SQL parser.

Grammar (subset):

    stmt      := select_stmt | insert_stmt | create_stmt
    select    := SELECT [DISTINCT] select_list FROM ident [AS ident]
                 [WHERE expr] [GROUP BY expr_list] [HAVING expr]
                 [ORDER BY expr_list] [LIMIT INT]
    insert    := INSERT INTO ident [(ident_list)] VALUES (literal_list)[, ...]
    create    := CREATE TABLE ident (ident type [, ...])

    expr      := term (OR term)*
    term      := factor (AND factor)*
    factor    := NOT factor | compare
    compare   := primary (op primary)*
    primary   := literal | column_ref | '(' expr ')'

    literal   := INT | STRING | TRUE | FALSE | NULL
    column    := [ident '.'] ident | '*'
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from db_engine.modules.module_04_parser.ast_nodes import (
    Ast,
    ColumnRef,
    CreateTable,
    Expr,
    ExprKind,
    From,
    Insert,
    Select,
)
from db_engine.modules.module_04_parser.lexer import Token, TokenKind, lex


class _ParseError(Exception):
    pass


class SqlParser:
    """A small recursive-descent parser."""

    def __init__(self, src: str) -> None:
        self.tokens = lex(src)
        self.i = 0

    # -------------------------------------------------------------------
    # Public
    # -------------------------------------------------------------------

    def parse(self) -> Ast:
        stmt = self._parse_stmt()
        if self._peek().kind is not TokenKind.SEMI and self._peek().kind is not TokenKind.EOF:
            raise _ParseError(f"expected ; got {self._peek()}")
        return Ast(stmt=stmt)

    # -------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------

    def _peek(self, off: int = 0) -> Token:
        return self.tokens[min(self.i + off, len(self.tokens) - 1)]

    def _eat(self, kind: TokenKind | None = None, text: str | None = None) -> Token:
        tok = self._peek()
        if kind is not None and tok.kind is not kind:
            raise _ParseError(f"expected {kind}, got {tok}")
        if text is not None and tok.text.upper() != text.upper():
            raise _ParseError(f"expected {text!r}, got {tok}")
        self.i += 1
        return tok

    def _kw(self, *kw: str) -> Token:
        tok = self._peek()
        if tok.kind is TokenKind.KEYWORD and tok.text.upper() in {k.upper() for k in kw}:
            self.i += 1
            return tok
        raise _ParseError(f"expected one of {kw}, got {tok}")

    # -------------------------------------------------------------------
    # Statement dispatch
    # -------------------------------------------------------------------

    def _parse_stmt(self) -> Select | Insert | CreateTable:
        t = self._peek()
        if t.kind is TokenKind.KEYWORD:
            kw = t.text.upper()
            if kw == "SELECT":
                return self._parse_select()
            if kw == "INSERT":
                return self._parse_insert()
            if kw == "CREATE":
                return self._parse_create()
        raise _ParseError(f"unknown statement starting with {t}")

    # -------------------------------------------------------------------
    # SELECT
    # -------------------------------------------------------------------

    def _parse_select(self) -> Select:
        self._kw("SELECT")
        distinct = False
        if self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "DISTINCT":
            self._eat(TokenKind.KEYWORD)
            distinct = True
        cols = self._parse_select_list()
        self._kw("FROM")
        table_tok = self._eat(TokenKind.IDENT)
        alias: str | None = None
        if self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "AS":
            self._eat(TokenKind.KEYWORD)
            alias_tok = self._eat(TokenKind.IDENT)
            alias = alias_tok.text
        from_ = From(table=table_tok.text, alias=alias)
        where = None
        group_by: tuple[Expr, ...] = ()
        having: Expr | None = None
        order_by: tuple[tuple[Expr, bool], ...] = ()
        limit: int | None = None
        if self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "WHERE":
            self._eat(TokenKind.KEYWORD)
            where = self._parse_expr()
        if self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "GROUP":
            self._eat(TokenKind.KEYWORD)
            self._kw("BY")
            group_by = self._parse_expr_list()
        if self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "HAVING":
            self._eat(TokenKind.KEYWORD)
            having = self._parse_expr()
        if self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "ORDER":
            self._eat(TokenKind.KEYWORD)
            self._kw("BY")
            order_by = self._parse_order_list()
        if self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "LIMIT":
            self._eat(TokenKind.KEYWORD)
            n_tok = self._eat(TokenKind.NUMBER)
            limit = int(n_tok.text)
        return Select(distinct=distinct, columns=cols, from_=from_, where=where,
                       group_by=group_by, having=having, order_by=order_by, limit=limit)

    def _parse_select_list(self) -> tuple[Expr, ...]:
        out: list[Expr] = []
        out.append(self._parse_select_item())
        while self._peek().kind is TokenKind.COMMA:
            self._eat(TokenKind.COMMA)
            out.append(self._parse_select_item())
        return tuple(out)

    def _parse_select_item(self) -> Expr:
        if self._peek().kind is TokenKind.STAR:
            self._eat(TokenKind.STAR)
            return Expr(kind=ExprKind.STAR, value=("*",))

    def _parse_order_list(self) -> tuple[tuple[Expr, bool], ...]:
        out: list[tuple[Expr, bool]] = []
        out.append(self._parse_order_item())
        while self._peek().kind is TokenKind.COMMA:
            self._eat(TokenKind.COMMA)
            out.append(self._parse_order_item())
        return tuple(out)

    def _parse_order_item(self) -> tuple[Expr, bool]:
        e = self._parse_expr()
        asc = True
        if self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() in {"ASC", "DESC"}:
            asc = self._peek().text.upper() == "ASC"
            self._eat(TokenKind.KEYWORD)
        return e, asc

    def _parse_expr_list(self) -> tuple[Expr, ...]:
        out: list[Expr] = []
        out.append(self._parse_expr())
        while self._peek().kind is TokenKind.COMMA:
            self._eat(TokenKind.COMMA)
            out.append(self._parse_expr())
        return tuple(out)

    # -------------------------------------------------------------------
    # INSERT
    # -------------------------------------------------------------------

    def _parse_insert(self) -> Insert:
        self._kw("INSERT")
        self._kw("INTO")
        table_tok = self._eat(TokenKind.IDENT)
        cols: tuple[str, ...] = ()
        if self._peek().kind is TokenKind.LPAREN:
            self._eat(TokenKind.LPAREN)
            cols = self._parse_id_list()
            self._eat(TokenKind.RPAREN)
        self._kw("VALUES")
        rows: list[tuple[Expr, ...]] = []
        while True:
            self._eat(TokenKind.LPAREN)
            row = self._parse_expr_list()
            self._eat(TokenKind.RPAREN)
            rows.append(row)
            if self._peek().kind is TokenKind.COMMA:
                self._eat(TokenKind.COMMA)
                continue
            break
        return Insert(table=table_tok.text, columns=cols, values=tuple(rows))

    def _parse_id_list(self) -> tuple[str, ...]:
        out: list[str] = []
        out.append(self._eat(TokenKind.IDENT).text)
        while self._peek().kind is TokenKind.COMMA:
            self._eat(TokenKind.COMMA)
            out.append(self._eat(TokenKind.IDENT).text)
        return tuple(out)

    # -------------------------------------------------------------------
    # CREATE TABLE
    # -------------------------------------------------------------------

    def _parse_create(self) -> CreateTable:
        self._kw("CREATE")
        self._kw("TABLE")
        name = self._eat(TokenKind.IDENT).text
        self._eat(TokenKind.LPAREN)
        cols: list[tuple[str, str]] = []
        cols.append(self._parse_column_def())
        while self._peek().kind is TokenKind.COMMA:
            self._eat(TokenKind.COMMA)
            cols.append(self._parse_column_def())
        self._eat(TokenKind.RPAREN)
        return CreateTable(name=name, columns=tuple(cols))

    def _parse_column_def(self) -> tuple[str, str]:
        n_tok = self._eat(TokenKind.IDENT)
        t_tok = self._eat(TokenKind.IDENT)
        return n_tok.text, t_tok.text.upper()

    # -------------------------------------------------------------------
    # Expressions
    # -------------------------------------------------------------------

    def _parse_expr(self) -> Expr:
        return self._parse_or()

    def _parse_or(self) -> Expr:
        node = self._parse_and()
        while self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "OR":
            self._eat(TokenKind.KEYWORD)
            rhs = self._parse_and()
            node = Expr(kind=ExprKind.BINOP, op="OR", args=(node, rhs))
        return node

    def _parse_and(self) -> Expr:
        node = self._parse_not()
        while self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "AND":
            self._eat(TokenKind.KEYWORD)
            rhs = self._parse_not()
            node = Expr(kind=ExprKind.BINOP, op="AND", args=(node, rhs))
        return node

    def _parse_not(self) -> Expr:
        if self._peek().kind is TokenKind.KEYWORD and self._peek().text.upper() == "NOT":
            self._eat(TokenKind.KEYWORD)
            return Expr(kind=ExprKind.UNARY, op="NOT", args=(self._parse_not(),))
        return self._parse_compare()

    def _parse_compare(self) -> Expr:
        left = self._parse_primary()
        if self._peek().kind is TokenKind.OP and self._peek().text in {"=", "<", ">", "<=", ">=", "!=", "<>"}:
            op_tok = self._eat(TokenKind.OP)
            right = self._parse_primary()
            return Expr(kind=ExprKind.COMPARE, op=op_tok.text, args=(left, right))
        return left

    def _parse_primary(self) -> Expr:
        tok = self._peek()
        if tok.kind is TokenKind.NUMBER:
            self._eat(TokenKind.NUMBER)
            return Expr(kind=ExprKind.LITERAL, value=int(tok.text))
        if tok.kind is TokenKind.STRING:
            self._eat(TokenKind.STRING)
            return Expr(kind=ExprKind.LITERAL, value=tok.text)
        if tok.kind is TokenKind.KEYWORD and tok.text.upper() == "TRUE":
            self._eat(TokenKind.KEYWORD)
            return Expr(kind=ExprKind.LITERAL, value=True)
        if tok.kind is TokenKind.KEYWORD and tok.text.upper() == "FALSE":
            self._eat(TokenKind.KEYWORD)
            return Expr(kind=ExprKind.LITERAL, value=False)
        if tok.kind is TokenKind.KEYWORD and tok.text.upper() == "NULL":
            self._eat(TokenKind.KEYWORD)
            return Expr(kind=ExprKind.LITERAL, value=None)
        if tok.kind is TokenKind.LPAREN:
            self._eat(TokenKind.LPAREN)
            e = self._parse_expr()
            self._eat(TokenKind.RPAREN)
            return e
        if tok.kind is TokenKind.IDENT:
            return self._parse_column()
        raise _ParseError(f"unexpected token {tok}")

    def _parse_column(self) -> Expr:
        n_tok = self._eat(TokenKind.IDENT)
        if self._peek().kind is TokenKind.DOT:
            self._eat(TokenKind.DOT)
            m_tok = self._eat(TokenKind.IDENT)
            return Expr(kind=ExprKind.COLUMN, value=ColumnRef(table=n_tok.text, name=m_tok.text))
        return Expr(kind=ExprKind.COLUMN, value=ColumnRef(table=None, name=n_tok.text))


__all__ = ["SqlParser"]
