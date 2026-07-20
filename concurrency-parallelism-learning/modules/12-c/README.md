# C — concurrency & parallelism (Ch12)

C11 / C17. The lowest level. C is the language where you *see* the memory
model the compiler is generating, and you have to specify exactly the
ordering of every shared access.

## What an expert can do after this module

- Read the **C11 memory model** (ISO/IEC 9899:2011 §6.8): sequenced-before,
  synchronizes-with, happens-before, the four `memory_order` values
  (`relaxed`, `acquire`, `release`, `seq_cst`).
- Use pthreads correctly: `pthread_create`, `pthread_join`,
  `pthread_mutex_*`, `pthread_rwlock_*`, `pthread_cond_*`, `pthread_barrier_*`.
- Implement a lock-free SPSC queue with `atomic` and a power-of-two ring.
- Use OpenMP for `#pragma omp parallel for`, `#pragma omp parallel`,
  reduction clauses, scheduling (`static`, `dynamic`, `guided`).
- Profile with `perf`, `VTune`, `likwid`; understand cache line false
  sharing and how to pad with `alignas`/`_Alignas`.
- Build a custom thread pool with work-stealing (C11 atomics + chase-lev
  work-stealing deque).
- Reason about false sharing: two atomic variables in the same cache line
  are *not* independent.

## Layout

```
modules/12-c/
├── README.md
├── Makefile
├── include/
│   ├── cp_atomic.h          — atomic primitives + memory_order wrappers
│   ├── cp_barrier.h         — pthread_barrier_t wrapper
│   ├── cp_pool.h            — thread pool
│   ├── cp_spsc.h            — single-producer single-consumer lock-free queue
│   ├── cp_mpmc.h            — bounded MPMC queue (mutex + condvar)
│   └── cp_patterns.h        — the six cross-language tasks
├── src/
│   ├── ch01_pthreads.c
│   ├── ch02_mutex.c
│   ├── ch03_condvar.c
│   ├── ch04_atomics.c
│   ├── ch05_openmp.c
│   ├── ch06_lockfree.c
│   ├── ch07_pool.c
│   ├── ch08_patterns.c
│   └── main.c               — runs all six cross-language tasks
└── tests/
    └── (one test per chapter; CTest or hand-rolled assert harness)
```

## How to run

```bash
cd modules/12-c
make            # builds the demo binary
make test       # builds and runs the tests
```

The local build host does not have `gcc` installed; the code is reviewed
by inspection. Targets:

- `-std=c11 -pthread -O2 -Wall -Wextra -Werror -fsanitize=thread`
- For OpenMP: `-fopenmp`

## Cross-language task implementations

`src/ch08_patterns.c` re-implements the six tasks using only C11 +
pthreads + atomics. The tests in `tests/` assert the same properties as
the TypeScript reference.

## Memory model

C11 §6.8 is the most carefully specified memory model of any production
language. Key idea: every access to a non-atomic shared location is a
**data race** and is **undefined behaviour** — your program can do
*anything*. Atomic access is well-defined; the `memory_order` parameter
controls which compiler/CPU reordering is allowed.

| memory_order | what it does |
|---|---|
| `memory_order_relaxed` | no ordering; only atomicity. |
| `memory_order_acquire` | no reads/writes after can be reordered before this load. |
| `memory_order_release` | no reads/writes before can be reordered after this store. |
| `memory_order_acq_rel` | both. |
| `memory_order_seq_cst` | acquire + release + a single total order S. |
