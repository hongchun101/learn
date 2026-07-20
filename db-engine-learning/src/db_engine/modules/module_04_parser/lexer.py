"""SQL lexer.

A tiny scanner: words, numbers, strings, operators, punctuation.

Use it like:

    tokens = lex("SELECT * FROM t WHERE a = 1;")
    for tok in tokens: ...
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto


class TokenKind(Enum):
    KEYWORD = auto()
    IDENT = auto()
    NUMBER = auto()
    STRING = auto()
    OP = auto()
    LPAREN = auto()
    RPAREN = auto()
    COMMA = auto()
    SEMI = auto()
    STAR = auto()
    DOT = auto()
    EOF = auto()


_KEYWORDS = {
    "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "CREATE",
    "TABLE", "AS", "AND", "OR", "NOT", "NULL", "TRUE", "FALSE",
    "DISTINCT", "ORDER", "BY", "ASC", "DESC", "LIMIT", "GROUP",
    "HAVING", "INT", "BIGINT", "TEXT", "BOOL",
}


@dataclass(slots=True, frozen=True)
class Token:
    kind: TokenKind
    text: str
    pos: int


def lex(src: str) -> list[Token]:
    tokens: list[Token] = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        # Skip whitespace.
        if c in " \t\n\r":
            i += 1
            continue
        # Numbers (int only).
        if c.isdigit():
            j = i
            while j < n and src[j].isdigit():
                j += 1
            tokens.append(Token(TokenKind.NUMBER, src[i:j], i))
            i = j
            continue
        # Identifiers / keywords.
        if c.isalpha() or c == "_":
            j = i
            while j < n and (src[j].isalnum() or src[j] == "_"):
                j += 1
            text = src[i:j]
            kind = TokenKind.KEYWORD if text.upper() in _KEYWORDS else TokenKind.IDENT
            tokens.append(Token(kind, text, i))
            i = j
            continue
        # Strings.
        if c in ("'", '"'):
            quote = c
            j = i + 1
            buf: list[str] = []
            while j < n and src[j] != quote:
                if src[j] == "\\" and j + 1 < n:
                    buf.append(src[j + 1])
                    j += 2
                    continue
                buf.append(src[j])
                j += 1
            tokens.append(Token(TokenKind.STRING, "".join(buf), i))
            i = j + 1
            continue
        # Punctuation / operators.
        if c == "(":
            tokens.append(Token(TokenKind.LPAREN, c, i))
            i += 1
            continue
        if c == ")":
            tokens.append(Token(TokenKind.RPAREN, c, i))
            i += 1
            continue
        if c == ",":
            tokens.append(Token(TokenKind.COMMA, c, i))
            i += 1
            continue
        if c == ";":
            tokens.append(Token(TokenKind.SEMI, c, i))
            i += 1
            continue
        if c == "*":
            tokens.append(Token(TokenKind.STAR, c, i))
            i += 1
            continue
        if c == ".":
            tokens.append(Token(TokenKind.DOT, c, i))
            i += 1
            continue
        # Multi-char operators.
        if src[i : i + 2] in {">=", "<=", "!=", "<>"}:
            tokens.append(Token(TokenKind.OP, src[i : i + 2], i))
            i += 2
            continue
        if c in "=<>+-":
            tokens.append(Token(TokenKind.OP, c, i))
            i += 1
            continue
        raise SyntaxError(f"unexpected character {c!r} at position {i}")
    tokens.append(Token(TokenKind.EOF, "", n))
    return tokens


__all__ = ["Token", "TokenKind", "lex"]
