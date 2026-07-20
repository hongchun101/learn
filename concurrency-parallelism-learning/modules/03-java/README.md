# Module 03 — Java 8 Concurrency & Parallelism

A from-0-to-expert curriculum on the Java Memory Model and its
concurrency primitives, written for **Java 8** (the build host ships
`javac 1.8.0_412`). Every chapter comes with code, tests, and a paper
that maps the API surface to the formal JMM rules.

## Layout

```
modules/03-java
├── pom.xml                                # Java 8, JUnit 4.13.2, Hamcrest, Awaitility
├── README.md                              # this file
└── src
    ├── main/java/cp/chapters/
    │   ├── ch01_threads/                  # Thread, Runnable, synchronized, wait/notify, ThreadLocal
    │   ├── ch02_juc/                      # ReentrantLock, ReadWriteLock, Semaphore, CountDownLatch,
    │   │                                  #   CyclicBarrier, Phaser, Exchanger, BlockingQueue,
    │   │                                  #   ConcurrentHashMap, CopyOnWriteArrayList
    │   ├── ch03_atomic/                   # AtomicInteger/Long/Reference, AtomicStampedReference,
    │   │                                  #   LongAdder, AtomicLongFieldUpdater
    │   ├── ch04_executors/                # ExecutorService, ThreadPoolExecutor,
    │   │                                  #   ScheduledExecutorService, ForkJoinPool, CompletableFuture
    │   ├── ch05_collections_par/          # parallelStream(), custom ForkJoinTask, work-stealing
    │   ├── ch06_patterns/                 # the six cross-language patterns
    │   ├── ch07_synchronizers/            # barriers built from latches, Phaser tree barriers
    │   └── ch08_locks_advanced/           # read-write downgrade, StampedLock, custom AQS primitive
    └── test/java/cp/chapters/             # mirrors main: tests use CountDownLatch + AtomicBoolean
        │                                  # for synchronisation; Thread.sleep only when timing is
        │                                  # genuinely the thing-under-test
```

## Build & Test

```bash
cd modules/03-java
mvn -q -DskipTests package      # compile only
mvn -q test                     # 74 tests, all green
```

If Maven is unavailable, the fallback invocation is:

```bash
CP="$(find ~/.m2/repository -name 'junit-4.13.2.jar' -o -name 'hamcrest-core-1.3.jar' \
   -o -name 'hamcrest-2.1.jar' -o -name 'awaitility-4.2.0.jar' 2>/dev/null \
   | paste -sd: -)"
mkdir -p build/classes build/test-classes
javac -d build/classes -cp "$CP" $(find src/main/java -name '*.java')
javac -d build/test-classes -cp "build/classes:$CP" \
    $(find src/test/java -name '*.java')
java -cp "build/classes:build/test-classes:$CP" \
    org.junit.runner.JUnitCore cp.chapters.ch06_patterns.CrossLangTest
```

## The model — Java Memory Model (JSR-133)

The JMM is defined by JLS §17 (third edition onward, JSR-133). It is a
*causally-consistent* memory model: every action is ordered by the
*happens-before* partial order, derived from a small set of edges.

### Happens-before edges we lean on

| Edge                                          | JLS §17.4.4 anchor | What it gives you                                      |
|-----------------------------------------------|--------------------|--------------------------------------------------------|
| `Thread.start()` → first action of new thread | §17.4.4            | parent writes visible to the child                     |
| Last action of thread `T` → `T.join()` return | §17.4.4            | child's writes visible to the joiner                    |
| `wait()` → `notify()`/`notifyAll()` pair      | §17.4.4            | state set before notify visible to the awaking waiter   |
| Lock release → subsequent lock acquire        | §17.4.4            | monitor state published to the next holder             |
| `volatile` write → subsequent `volatile` read | §17.4.4            | total order on the volatile, plus release/acquire fence|
| `final` field write in ctor → ctor completion | §17.5              | safe publication without synchronization on a **safely** published reference |
| `AtomicXxx.set`/`compareAndSet` → subsequent `get` | §17.7 (AQS spec) | lock-free state propagation                           |
| `Thread.interrupt()` → `InterruptedException` | §17.4.4            | cancellation-state propagation                          |

### Practical rules

1. **All shared mutable state that crosses threads must use a
   happens-before edge.** Either a `synchronized` block, a
   `java.util.concurrent` synchroniser, a `volatile`, an atomic, a
   `final`-with-safe-publication, or an explicit AQS-style primitive.
2. **No data races.** A data race occurs when two accesses to the same
   field are not ordered by happens-before; JMM forbids it and most
   JVMs will not crash but will give surprising results.
3. **The `synchronized` keyword is a monitor.** Acquire/release is a
   full memory fence; within a `synchronized` block you may freely use
   plain fields without further synchronization, **provided every
   access to that state is locked the same way**.
4. **`volatile` is not atomic for compound operations.** Use
   `AtomicInteger`/`AtomicReference`, or guard the field with a lock.
5. **`final` is special.** A `final` field, after the constructor in
   which it is set has completed safely (no `this` escape), is visible
   to any thread that obtains a reference to the constructed object
   without further synchronization. This is why immutable classes in
   `java.util` can hand out safely-published instances.

### Memory-model reasoning cited per primitive

The relevant JLS sections and JDK contracts we cite:

- `synchronized` — JLS §17.1, §17.4.4
- `volatile` — JLS §17.4, §17.7
- `final` fields — JLS §17.5
- `java.lang.Thread` — JLS §17.4.4
- `java.util.concurrent` — JSR-166 spec contract (subset of JLS §17)
- `AbstractQueuedSynchronizer` — Doug Lea's *The JSR-133 Cookbook*
  and the Javadoc that documents "happens-before guarantee" on
  acquire/release

## Chapter notes

### ch01 — Raw threads
`Thread`, `Runnable`, `synchronized`, `wait`/`notify`,
`ThreadLocal`, `InheritableThreadLocal`. The `wait/notify` demo
demonstrates the canonical producer/consumer skeleton on the
intrinsic monitor; modern code should prefer `java.util.concurrent`
synchronisers (ch02) or `BlockingQueue` (ch02). `ThreadLocal`'s
memory-model story is "no sharing": reads and writes from the same
thread are always consistent.

### ch02 — `java.util.concurrent` toolkit
- `ReentrantLock` — explicit lock with timed / interruptible acquire.
  Its happens-before edge is the same as `synchronized` (JLS §17.4.4
  + AQS contract).
- `ReadWriteLock` — many concurrent readers, exclusive writer.
  Down-grading (writer → reader) is safe; upgrading (reader → writer)
  is unsafe.
- `StampedLock` (Java 8+) — three-mode lock; `tryOptimisticRead`
  returns a stamp the reader validates under no lock. Fallback to a
  normal read on validation failure.
- `Semaphore` — counting licence plate. Each `acquire`/`release` is
  a fence.
- `CountDownLatch` — single-use rendezvous. `countDown`
  synchronizes-with `await` returns.
- `CyclicBarrier` — N-party, reusable rendezvous with optional
  per-generation action.
- `Phaser` — multi-phase, dynamic-party barrier. Each phase transition
  is a synchronizes-with edge.
- `Exchanger` — two-party swap. `exchange()` synchronizes-with its
  partner.
- `BlockingQueue` family — the canonical hand-off primitive.
  `put` synchronizes-with `take`.
- `ConcurrentHashMap` — Java 8+ tree-on-overload, lock-striped design.
  JSR-166 §4.4 enumerates the happens-before guarantees.
- `CopyOnWriteArrayList` — snapshot-on-write; ideal for
  rarely-mutated, heavily-read collections.

### ch03 — Atomics
`AtomicInteger`, `AtomicLong`, `AtomicReference`, `AtomicStampedReference`,
`LongAdder`, `AtomicLongFieldUpdater`. Each method on an atomic is
itself a synchronizes-with edge; compound operations need
`compareAndSet` loops. `LongAdder` is striped for high write
contention.

> **Note on VarHandle.** `java.lang.invoke.VarHandle` was introduced
> in **JDK 9**. This module is Java 8 only, so we use the pre-existing
> `AtomicXxxFieldUpdater` API which provides the same semantics via
> a different surface. The underlying fence semantics are identical.

### ch04 — Executors
- `ExecutorService` and `ThreadPoolExecutor` — pool-based task
  execution. We build a named, bounded pool by hand in
  `ThreadPoolExecutorDemo`.
- `ScheduledExecutorService` — periodic and delayed work. Three
  semantics (`schedule`, `scheduleAtFixedRate`, `scheduleWithFixedDelay`)
  covered in `ScheduledExecutorDemo`.
- `ForkJoinPool` — work-stealing. We sum squares via divide-and-conquer
  (`SumSquares`) and report the steal count.
- `CompletableFuture` / `CompletionStage` — fluent asynchronous
  composition. We provide `thenApply`, `thenCombine`, and a
  pre-Java-9 implementation of `orTimeout` named `withTimeout`.

### ch05 — Parallel collections
`Collection.parallelStream()` is built on top of `ForkJoinPool` and
respects encounter order unless the pipeline is unordered. We
implement a custom `RecursiveTask` (`SumMapper`) that divides by half
and exhibits the standard fork-then-join pattern. The `WorkStealingDemo`
fans out tasks and reports `ForkJoinPool.getStealCount()`.

### ch06 — Cross-language patterns
The six tasks from `src/cross-lang/*.ts` reimplemented idiomatically:
`FanOutFanIn`, `Pipeline`, `RateLimiter`, `Barrier`, `MpmcQueue`,
`ParallelReduce`. Tests in `src/test/java/.../CrossLangTest.java`
mirror `tests/cross-lang.test.ts` exactly — every assertion that the
TS suite makes is duplicated here.

`MpmcQueue` wraps a `LinkedBlockingQueue` for the actual storage
because LBQ is a rock-solid implementation of the same MPMC contract;
the wrapper adds a `closed` flag and the timeout-returns-null semantic.

### ch07 — Synchronizers built from primitives
`BarrierFromLatchDemo` shows a reusable barrier built from a pair of
`CountDownLatch`es with the per-generation "last arriver runs the
action" pattern. `TreePhaserDemo` illustrates the tree-of-phasers
idiom for logarithmic rendezvous.

### ch08 — Advanced locks
- `ReadWriteLockDowngradeDemo` — atomically transition writer → reader
  by acquiring the read lock while still holding the write lock.
  Upgrading (reader → writer) is unsafe and is deliberately absent.
- `StampedLockOptimisticDemo` — optimistic read with validate-on-success;
  falls back to a real read lock on stamp invalidation.
- `CountDownLatchPlus` — from-scratch `CountDownLatch` built on
  `AbstractQueuedSynchronizer`, plus a `reset(int)` method the
  standard class lacks.

## Quality bar

- No `Thread.stop`/`suspend`/`resume` (all deprecated, all unsafe).
- Every lock release is in a `finally` block.
- Every `ExecutorService`/`ScheduledExecutorService`/`ForkJoinPool`
  is shut down in `@After` or try-with-resources equivalent.
- No empty `catch` blocks.
- Tests favour `CountDownLatch` + `AtomicBoolean` for synchronisation
  over `Thread.sleep`.
- Cross-language tests assert the same properties as the TS reference
  (modulo a small slack on the MPMC round-trip window where the JDK's
  parking semantics differ from a JS event loop).

## What an expert can do after this module

After working through ch01–ch08, you can:

- [ ] State the JMM happens-before edges from memory and cite the JLS
      sections for each.
- [ ] Choose between `synchronized`, `ReentrantLock`, and
      `ReentrantReadWriteLock` for a given workload, and explain why.
- [ ] Pick the right synchroniser for a given rendezvous pattern:
      `CountDownLatch` for one-shot, `CyclicBarrier` for fixed-party
      reusable, `Phaser` for dynamic/multi-phase, `Semaphore` for
      bounded pool.
- [ ] Decide when a `BlockingQueue` is preferable to a custom
      hand-off channel, and which of the `Array` / `Linked` /
      `Priority` / `Synchronous` variants fits the workload.
- [ ] Implement `AtomicReference.compareAndSet` loops and reason about
      ABA risks, reaching for `AtomicStampedReference` when needed.
- [ ] Pick the right `ExecutorService` flavour: fixed thread pool,
      scheduled, fork-join, `CompletableFuture` for fluent pipelines.
- [ ] Compose `CompletionStage` graphs to express fan-out/fan-in,
      timeouts, and error recovery.
- [ ] Use `parallelStream()` safely — i.e. only with associative,
      stateless operations.
- [ ] Decide between upgrading and downgrading a `ReadWriteLock` and
      know which is safe.
- [ ] Implement `Lock`-style primitives on top of
      `AbstractQueuedSynchronizer`.
- [ ] Write Java 8 code that compiles and runs on a toolchain whose
      newest feature is lambdas.

## Citation

This module cites:

- **JSR-133** — Java Memory Model specification (JLS §17).
  *JEP / JLS accessible at <https://docs.oracle.com/javase/specs/>.*
- **JSR-166** — Concurrency utilities specification; the legal
  memory-model contract for every class in `java.util.concurrent`.
- **Doug Lea** — *The JSR-133 Cookbook for Compiler Writers*,
  describes how to compile `volatile` and `synchronized` correctly.
- **Goetz et al.** — *Java Concurrency in Practice* (Addison-Wesley,
  2006). The pragmatic companion to the specification.
