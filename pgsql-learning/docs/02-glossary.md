# 02 — Glossary

> Single source of truth for every term in the curriculum. Whenever a
> module introduces a word, the word links here.

## A

| Term | Definition |
|------|------------|
| **access method** | An interface to a type of index. `btree`, `hash`, `gin`, `gist`, `brin`, `spgist`. Set on `USING <method>` in `CREATE INDEX`. |
| **advisory lock** | Application-defined lock keyed on `(int, int)`. `pg_advisory_lock`. Module 26. |
| **ANALYZE** | Either (a) the SQL command that updates `pg_statistic`, or (b) the EXPLAIN option that runs the query and reports row counts. Module 22. |
| **autovacuum** | The background subsystem that drives `VACUUM` and `ANALYZE` based on table-level thresholds. Module 19. |

## B

| Term | Definition |
|------|------------|
| **base backup** | A `pg_basebackup` snapshot of a running cluster. Module 21. |
| **bgwriter** | Background worker that writes dirty pages from `shared_buffers` to disk between checkpoints. |
| **B-tree** | The default access method. Compresses keys, supports equality + ordered range + IS NULL. Module 11. |
| **BRIN** | Block Range Index: a tiny summary index that tells you "this 128-page range has min X / max Y". Module 11. |
| **buffer** | An 8 KB page in `shared_buffers`. Hit/miss counts come from here in EXPLAIN. |

## C

| Term | Definition |
|------|------------|
| **cardinality** | The number of rows a plan operator is expected to produce. Planner inputs this from `pg_statistic`. |
| **CAST** | A type conversion defined in `pg_cast`. Default + assignment casts. |
| **checkpoint** | A point past which all heap is known to be on disk; enables WAL reuse. Modules 17, 19. |
| **CID** | Command ID: per-backend monotonic counter (`xid, cid`). Module 16. |
| **CLOG** | Commit Log: the `pg_xact/` files that record per-xid status (in-progress, committed, aborted, sub-committed). |
| **columnar** | Logical column-store layout. PostgreSQL is a row store; columnar extensions exist. Module 13. |
| **COMMIT** | Final state of a transaction. Records a WAL `COMMIT` record. |

## D

| Term | Definition |
|------|------------|
| **dead tuple** | A heap tuple whose `xmax` is committed; visible to no future snapshot; reclaimable by vacuum. Module 19. |
| **dblink** | Extension for executing SQL against a remote database in the same session. Module 15. |
| **DISTINCT** | Either ON, BY, ON (comparable), or UNIQUE — see SET operations in module 08. |

## E

| Term | Definition |
|------|------------|
| **EXPLAIN** | Outputs the plan tree. `(ANALYZE)` runs the query. `(BUFFERS)` shows I/O. Module 10. |
| **extension** | A bundle of SQL objects installed with `CREATE EXTENSION`. Modules 13, 24. |

## F

| Term | Definition |
|------|------------|
| **FDW** | Foreign Data Wrapper. Lets PostgreSQL push SQL into / pull data from a non-native source. Modules 15, 28. |
| **freeze** | Setting `t_infomask` to mark a tuple as visible to **all** future transactions (xmin "frozen"). Module 19. |
| **function** | Either a built-in (in C), an SQL function (a saved query), or a PL/pgSQL function (imperative). Module 13. |

## G

| Term | Definition |
|------|------------|
| **GIN** | Generalized Inverted Index: full-text search, jsonb, arrays. Module 11, 24. |
| **GiST** | Generalized Search Tree: ranges, geometric types, trigrams. Module 11. |
| **group** | A set of rows with the same key produced by `GROUP BY`; the unit on which aggregates run. Module 06. |

## H

| Term | Definition |
|------|------------|
| **hash join** | Join algorithm: build a hash on the inner side, probe with the outer. Module 03, 18. |
| **HOT** | Heap-Only Tuple: an UPDATE that doesn't change indexed columns and stays on the same page; index pointers are unchanged. |
| **hot standby** | A replica where read-only queries are allowed while WAL is replayed. Module 20. |

## I

| Term | Definition |
|------|------------|
| **identifier** | A column or table name (`"foo"`, `bar`). Quoting escapes reserved words. |
| **index** | A relfilenode with an access method and a defined ordering; used by the planner to satisfy predicates and orders. Module 11. |
| **isolation level** | `READ UNCOMMITTED` is an alias for `READ COMMITTED` in PostgreSQL. Real levels: `READ COMMITTED`, `REPEATABLE READ`, `SERIALIZABLE`. Module 16. |
| **`is_visible`** | Whether a snapshot can see a tuple, governed by `(xmin, xmax, infomask)`. |

## J

| Term | Definition |
|------|------------|
| **JSON** | Text-typed JSON; validates but is stored as text. |
| **JSONB** | Binary JSON: stored decomposed, supports rich indexing. Module 01. |
| **join** | INNER / LEFT / RIGHT / FULL / CROSS / LATERAL / SEMI / ANTI / EXISTS. Modules 03, 09. |

## K

| Term | Definition |
|------|------------|
| **kill_tuples** | Subset of dead tuples targeted by the next vacuum (those every current snapshot would have ignored already). |

## L

| Term | Definition |
|------|------------|
| **LATERAL** | Lets a subquery on the FROM side reference columns from preceding FROM items. Modules 03, 09. |
| **logging_collector** | A process that captures stderr into `pg_log/*.log` per rotation policy. |
| **logical replication** | Replicating decoded tuples (row-based). Module 20. |
| **LSN** | Log Sequence Number: a 64-bit offset into the WAL stream. Modules 17, 20, 21. |

## M

| Term | Definition |
|------|------------|
| **maintenance_work_mem** | Memory for VACUUM, ANALYZE, CREATE INDEX, ALTER TABLE ADD FOREIGN KEY. |
| **materialized view** | A view that physically stores result rows; refreshed explicitly or via REFRESH MATERIALIZED VIEW CONCURRENTLY. Module 12. |
| **MERGE** | Single-statement INSERT/UPDATE/DELETE branching on a join result. Module 02. |
| **MVCC** | Multi-Version Concurrency Control. Modules 16, 17. |

## N

| Term | Definition |
|------|------------|
| **nested loop** | The default join algorithm for small outer sets; O(n*m). Modules 03, 18. |
| **NOTIFY** | A pub/sub channel on a PostgreSQL session. |

## P

| Term | Definition |
|------|------------|
| **partitioning** | A declarative table with N child tables that share the parent's schema and identity. Modules 14, 28. |
| **pg_stat_statements** | An extension that records normalised query statistics. Module 22. |
| **pgvector** | An extension providing the `vector` type and HNSW / IVFFLAT indexes. Module 24. |
| **PITR** | Point-In-Time Recovery: replaying archived WAL up to a chosen LSN or timestamp. Module 21. |

## R

| Term | Definition |
|------|------------|
| **range type** | `int4range`, `tstzrange`, etc.; stored, indexed with GiST/SP-GiST. Module 01. |
| **RDS / Aurora-style** | Vendors that wrap physical streaming with a clustered storage layer. Module 28. |
| **REFRESH CONCURRENTLY** | A non-blocking REFRESH MATERIALIZED VIEW that builds a diff and swaps. Module 12. |
| **RLS** | Row-Level Security: per-row policies on a table. Module 23. |
| **rule** | A rewrite rule: every valid SQL the system might see; pre-planner transformation. Module 12. |

## S

| Term | Definition |
|------|------------|
| **scalar subquery** | A subquery expected to return one row/one column; used as a value. Module 09. |
| **schema** | A namespace inside a database: `public`, `audit`, `billing`, ... |
| **SET operation** | UNION, INTERSECT, EXCEPT. Module 08. |
| **shared_buffers** | The main shared memory region. Default ~25% of RAM. Modules 17, 25, 27. |
| **slot (replication slot)** | A server-side cursor that tracks how far a replica has consumed the WAL. Module 20. |
| **snapshot** | A point-in-time view of the database: `(xmin_horizon, xmax, active_xip[])`. Module 16. |
| **streaming replication** | Replicating WAL bytes from primary to standby. Module 20. |

## T

| Term | Definition |
|------|------------|
| **temp_buffers** | Per-session memory used for temporary tables. |
| **tlist** | The result row shape planned at the leaf of an operator. |
| **TOAST** | The Out-of-line Storage mechanism for wide fields. |
| **trigger** | Code that fires on a row/table event. Module 13. |
| **txid** | Transaction ID: 32-bit unsigned integer allocated from a global counter; wraps every ~4 billion. Module 19. |

## U

| Term | Definition |
|------|------------|
| **UNNEST** | Table-function that takes an array and returns one row per element. Module 08. |
| **UPSERT** | `INSERT ... ON CONFLICT DO UPDATE | DO NOTHING`. Module 02. |

## V

| Term | Definition |
|------|------------|
| **vacuum** | Reclaims tuples whose `xmax` is committed and no snapshot considers visible. Modules 16, 19. |
| **varlena** | A variable-length value: `text`, `jsonb`, `bytea`, arrays, numeric. |
| **view** | A stored query that is inlined into plans. Module 12. |

## W

| Term | Definition |
|------|------------|
| **WAL** | Write-Ahead Log. Modules 17, 19, 20, 21. |
| **window function** | Aggregate over a frame defined by `OVER (PARTITION BY ... ORDER BY ... ROWS BETWEEN ... )`. Module 07. |
| **work_mem** | Memory per sort / hash / hash-aggregate per query. Modules 03, 25. |

## X

| Term | Definition |
|------|------------|
| **xmax** | The transaction ID that is the deleter (or 0). |
| **xmin** | The transaction ID of the inserter; the lifetime-begin of the tuple. |

## Y

| Term | Definition |
|------|------------|
| **yield** | Either producer side: returning a row (Volcano / iterator) or interrupting a long blocking operation. |

## Z

| Term | Definition |
|------|------------|
| **zero-downtime** | Pattern: logical replication to a logical replica, schema migrate, cut over. Module 20. |
