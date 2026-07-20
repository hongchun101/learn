# 02 · Glossary

The vocabulary the rest of the repo uses. Every term below maps to one
or more chapters.

| Term | One-line meaning | Chapter |
|------|------------------|---------|
| **page** | the unit of disk I/O, fixed size (default 4 KiB) | 01 |
| **slotted page** | a page layout where slots index row offsets | 01 |
| **row id (RID)** | stable (page_id, slot_id) handle to a row | 01 |
| **B+Tree** | disk-friendly index, all values in leaves, leaves linked | 01 |
| **LSM** | append-only sorted runs merged in background | 01, 09 |
| **SSTable** | immutable sorted string table — an LSM run | 01 |
| **bloom filter** | probabilistic "definitely no / probably yes" | 09 |
| **WAL** | write-ahead log; every modification is logged before applied | 02 |
| **LSN** | log sequence number | 02 |
| **REDU / UNDO** | replay / rollback at recovery time | 02 |
| **checkpoint** | durable record of what's already on disk | 02 |
| **MVCC** | multi-version concurrency control — every row has versions | 03 |
| **snapshot** | a (read-ts, write-ts) pair identifying a transaction's view | 03 |
| **write conflict** | two transactions write the same key in overlapping snapshots | 03 |
| **GC** | garbage collection of superseded versions | 03 |
| **ARIES** | algorithm for recovery: analysis → REDO → UNDO | 02 |
| **lexer** | character stream → token stream | 04 |
| **AST** | abstract syntax tree | 04 |
| **recursive descent parser** | hand-rolled top-down parser | 04 |
| **operator** | a node in the physical plan (Scan, Filter, Project, …) | 05 |
| **Volcano** | pull-style iterator: open / next / close | 06 |
| **batch / vectorized** | pull N rows at a time | 10 |
| **morsel** | a chunk of work, sized by rows × workers | 11 |
| **NLJ** | nested-loop join | 07 |
| **hash join** | build hash on inner, probe on outer | 07 |
| **sort-merge join** | sort both sides, merge on key | 07 |
| **histogram** | statistical summary of column distribution | 08 |
| **CBO** | cost-based optimizer | 08 |
| **DPccp** | dynamic programming for join ordering (Selinger) | 08 |
| **covering index** | contains all columns referenced by the query | 09 |
| **zone map** | per-block (min, max, count-null) summary | 09 |
| **partition pruning** | skip data known to be out of range | 09, 13 |
| **exchange** | operator that ships rows between workers | 11 |
| **Raft** | consensus: leader election + log replication | 12 |
| **Paxos** | consensus precursor; a quorum agrees on a value | 12 |
| **2PC** | two-phase commit: prepare → commit | 12 |
| **linearizability** | real-time ordering of operations | 12 |
| **RLE** | run-length encoding | 13 |
| **dictionary encoding** | map distinct values to small ints | 13 |
| **delta encoding** | store differences from a base | 13 |
| **HLL** | hyperloglog: approximate distinct count | 14 |
| **t-digest / KLL** | mergeable quantile sketches | 14 |
| **codegen** | compile a query fragment to native code | 15 |
| **EXPLAIN** | describe (or, with ANALYZE, measure) a plan | 16 |
| **replay log** | record of events that can be re-driven deterministically | 16 |
| **wire protocol** | the byte sequence sent to clients | 17 |

## Where each term is introduced

If you don't know the term in the third column, read that chapter.
