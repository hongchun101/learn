# 01 — Architecture: The Storage and Process Model

> Everything PostgreSQL does is in service of three process roles, three
> memory regions, three file regions, and one disk. Read this once and the
> rest of the curriculum snaps into place.

## Process model

```
            ┌────────────────────────────────────────────┐
            │                postgres (postmaster)        │
            │  ─ owns shared memory                       │
            │  ─ listens on TCP socket                    │
            │  ─ forks background workers per slot        │
            └───────┬────────────────────┬────────────────┘
                    │                    │
   ┌────────────────▼──┐    ┌─────────────▼─────────────┐
   │  backend (per conn)│    │  background workers       │
   │  ─ parses SQL      │    │  ─ autovacuum launcher    │
   │  ─ plans           │    │  ─ autovacuum workers     │
   │  ─ executes        │    │  ─ logical rep launcher   │
   │  ─ reads/writes    │    │  ─ walwriter              │
   │    heap + indexes  │    │  ─ checkpointer           │
   │  ─ produces WAL    │    │  ─ bgwriter               │
   │  ─ emits commit    │    │  ─ stats collector         │
   │    → WAL → disk    │    │  ─ archiver (if archive)  │
   └────────────────────┘    └───────────────────────────┘
```

A **backend** is forked on every accepted connection. It serves one client
until the client disconnects, then exits. Backends never share state
except through `shared_buffers` and the WAL.

## Memory regions

| Region | Lifetime | Per | Owner | Tuned by |
|--------|----------|-----|-------|----------|
| `shared_buffers` | server lifetime | server | postmaster | `shared_buffers` |
| `wal_buffers`   | server lifetime | server | postmaster | `wal_buffers` (auto-tuned) |
| per-backend `work_mem` | per query | per backend | backend | `work_mem` |
| per-backend `maintenance_work_mem` | per maintenance op | per backend | backend | `maintenance_work_mem` |
| `effective_cache_size` | hints only | n/a | planner | `effective_cache_size` |
| `temp_buffers` | per session | per backend | backend | `temp_buffers` |

`effective_cache_size` is **not** memory; it's a hint to the planner
saying "the OS page cache roughly has this much data from this cluster."

## File regions

A PostgreSQL cluster on disk is one directory hierarchy rooted at the
**data directory** (PGDATA):

```
PGDATA/
├─ postgresql.conf          # config (config_file = $PGDATA/postgresql.conf)
├─ pg_hba.conf              # host-based authentication
├─ pg_ident.conf            # user-name maps
├─ PG_VERSION               # one file: the major.minor version
├─ global/                  # cluster-wide catalogs (pg_database, ...)
│  ├─ pg_database
│  ├─ pg_authid
│  └─ ...
├─ pg_wal/                  # Write-Ahead Log (post-10; pre-10 was pg_xlog)
│  └─ 000000010000000000000001  # 16 MB WAL segments
├─ pg_xact/                 # commit-log files (CLOG)
├─ pg_multixact/            # multi-transaction state
├─ pg_subtrans/             # sub-transaction status
├─ pg_notify/               # LISTEN/NOTIFY queue
├─ pg_serial/               # sequences that don't fit
├─ pg_snapshots/            # exported snapshots
├─ pg_stat/                 # stats collector files (pg_stat_tmp -> real)
├─ pg_stat_tmp/             # working area for the stats collector
├─ pg_replslot/             # replication slot state (no data, just positions)
├─ base/<dboid>/            # each database's heap + index files
│  ├─ 16400                 # heap or index: file name = relfilenode
│  └─ 16400.1
└─ pg_tblspc/               # tablespace symlinks
```

### The "files" inside `base/<dboid>/`

Each heap, index, TOAST table, or sequence has a **relfilenode** in
`pg_class`. The data lives in files named after that node, possibly split
into 1 GB segments: `12345`, `12345.1`, `12345.2`, ... Each file is a
sequence of 8 KB pages. Page 0 is special: it holds the **metadata** that
tells us how to interpret the rest.

```
page 0 layout (heap relation):
  PageHeaderData (24 B): pd_lsn, pd_checksum, pd_flags, pd_lower, pd_upper, pd_special, pd_pagesize_version
  pg_page_layout (ItemIdData array): pointer to each tuple by offset/length
  free space
  tuples (TOAST pointers begin at lower; newer tuples grow toward upper)
  ...
  (no special area on heap pages; B-tree pages have a special area)
```

A **tuple** has its own header. For heap tuples:

```
HeapTupleHeaderData (23 B on disk + alignment):
  t_xmin     ── inserting transaction (or frozen)
  t_xmax     ── deleting transaction (or 0)
  t_cid      ── command id within the inserting transaction
  t_infomask ── bit flags: HEAP_HASNULL, HEAP_HASVARWIDTH, HEAP_XMIN_FROZEN,
                HEAP_XMAX_INVALID, HEAP_UPDATED, ...
  t_infomask2─ index bits (HOT chain indicator, number of attributes)
  t_hoff     ── offset to user data
  ...
  user data (null bitmap, varlena, ...)
```

We dig into this in module 16. The contract is:

> Every heap tuple has `t_xmin`, `t_xmax`, and `t_infomask`. `xmin` is
> *not* the same as a transaction ID you can compare with `>`: visibility
> is decided against a snapshot.

## Write path

A simple `UPDATE` traces through every layer:

```
client → backend parses → planner builds plan → executor runs
                              │
                              ▼
                       HeapTuple constructed in backend memory
                              │
                              ▼
                       executor pins a buffer in shared_buffers
                              │
                              ▼
                       HeapTuple inserted into the page (line pointer at pd_upper)
                              │
                              ▼
                       WAL record constructed in wal_buffers
                              │
                              ▼
              on COMMIT:  walwriter flushes wal_buffers → disk  (durability)
                          bgwriter eventually writes the dirty buffer
                          checkpointer eventually fsyncs all dirty pages
                          (releases WAL up to a reusable point)
```

This is what "write-ahead log" means: the **WAL record goes to disk
before the heap page does**, so on a crash we replay WAL from the last
checkpoint to reconstruct any page that was dirty but not yet flushed.

## Plan tree

A query plan is a tree of **plan nodes**. The executor uses the
**Volcano / iterator model**: each node exposes `Init`, `ExecNext`, and
`End`. The root node returns rows one at a time to the client; leaves
read from heap, indexes, or external sources.

```
EXPLAIN SELECT * FROM t WHERE a < 100 ORDER BY b LIMIT 10;

Limit
  └─ Sort  (cost=...)
       └─ Index Scan using t_b_idx on t
              Index Cond: (a < 100)
```

Modules 10 and 18 read these trees fluently; module 25 acts on them.

## What you'll see in the EXPLAIN output

```
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS) SELECT ...
Seq Scan on t  (cost=...) (actual time=... rows=...)
  Filter: ...
  Rows Removed by Filter: ...
  Buffers: shared hit=...
Planning Time: ...
Execution Time: ...
```

Every cost number is in **cost units**, not milliseconds. The conversion
factor is set by `cpu_tuple_cost`, `seq_page_cost`, `random_page_cost`,
`cpu_operator_cost`, `parallel_tuple_cost`, `parallel_setup_cost`. You
will see this in module 18.

## Three things to take away

1. PostgreSQL has **one disk** and one `PGDATA` directory per cluster.
   Tablespaces are symlinks; they do not move the data anywhere magically.
2. The WAL is the durability boundary, **not** the heap.
3. The planner cost units are deterministic and tunable. When a plan
   surprises you, the surprise is rarely a planner bug.
