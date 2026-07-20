# Module 17 — Wire protocol

## What you'll learn

The wire protocol is the boundary between client and server. For
the curriculum it's a 5-byte header + payload:

    [4 bytes big-endian length][1 byte type tag][length bytes payload]

Type tags include `HELLO`, `QUERY`, `ROWS`, `ROW`, `ERROR`, `BYE`.

After this chapter you can:

- implement a length-prefixed frame protocol;
- run a toy TCP server that speaks it;
- explain why this is the right boundary for real adapters
  (PostgreSQL's protocol, MySQL's, ClickHouse's HTTP, DuckDB's
  Arrow Flight).

## Files

```
module_17_wire/
  __init__.py     # everything: Frame, Wire, TcpServer
```

## Tests

```
tests/modules/test_module_17_wire.py
```

1. `pack_frame`/`unpack_frame` round-trips.
2. `Wire.send_frame/recv_frame` works on an in-memory buffer.
3. Frame type is parsed correctly.
