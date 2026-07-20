# Scala — concurrency & parallelism (Ch08)

Scala 3.3+ on the JVM. Two stories in one module:

1. **JVM-level**: everything Java 8+ gives you (see `modules/03-java/` for the
   ground-truth primitives), plus Scala's higher-level combinators:
   `Future`, `ExecutionContext`, `Promise`, `ParSeq`, `Parallel` collections.
2. **Actor model**: Akka 2.x — `ActorSystem`, `ActorRef`, `Behaviors` (Akka
   Typed), supervision, location-transparent message passing. Akka is the
   canonical "let it crash" actor system in the JVM world.
3. **Effect system**: ZIO 2.x — the most rigorous async/IO abstraction in
   the ecosystem. `Ref`, `Queue`, `Promise`, `Semaphore`, `Fiber`, `Hub`,
   `STM`, structured concurrency, interruptible regions, `ZLayer`
   dependency injection. The cross-language tasks below are implemented
   in both `Future` (callback style) and `ZIO` (effect style) so you can
   see the difference line-by-line.

## What an expert can do after this module

- Translate any Java `ExecutorService` design into Scala's
  `ExecutionContext` and pick the right pool (ForkJoin, fixed, thread-pool-executor).
- Decide when `Future` is the right tool and when you need Akka actors or ZIO
  fibers; know the failure modes of each (lost callbacks vs mailbox overflow
  vs fiber leaks).
- Read and write Akka Typed `Behaviors` (the modern, type-safe API; not the
  untyped `Actor` of pre-2.6 Akka).
- Use ZIO's structured concurrency: `ZIO.scoped`, `FiberRef`, `ZLayer`,
  `Ref.Synchronized`, `STM`, `Schedule`. Know why `ZIO` is preferred over
  `Future` for production services in 2025+.
- Implement all six cross-language tasks in both `Future` and `ZIO` styles.

## Layout

```
modules/08-scala/
├── README.md
├── build.sbt
├── project/
│   ├── build.properties
│   └── plugins.sbt
├── src/main/scala/cp/chapters/
│   ├── Ch01Futures.scala        — Future/Promise/ExecutionContext
│   ├── Ch02Parallel.scala       — ParSeq, parallel collections, parallel-map-reduce
│   ├── Ch03AkkaTyped.scala      — Behaviors, supervision, router
│   ├── Ch04ZioCore.scala        — ZIO effect, Ref, Queue, Semaphore, Schedule
│   ├── Ch05ZioConcurrency.scala  — Fiber, FiberRef, ZSTM (software transactional memory)
│   ├── Ch06ZioPatterns.scala    — the six cross-language tasks in ZIO
│   ├── Ch07FuturePatterns.scala — the six cross-language tasks in Future
│   └── Ch08MemoryModel.scala    — JSR-133, happens-before, volatile, final
└── src/test/scala/cp/chapters/
    └── (one test per chapter)
```

## How to run

```bash
# Requires sbt and Scala 3.3+
cd modules/08-scala
sbt test
```

The local build host does not have sbt installed; the code is reviewed
by inspection. sbt 1.10.x and Scala 3.3.x are the targets.

## Cross-language task implementations

The `Ch07FuturePatterns` and `Ch06ZioPatterns` files each contain all six
tasks, mirroring the TypeScript reference in `src/cross-lang/`. The test
files (`Ch07FuturePatternsTest`, `Ch06ZioPatternsTest`) assert the same
properties:

- **Fan-out/Fan-in** — `N` inputs, `P` workers, output order = input order.
- **Pipeline** — `N` stages, each element flows through all of them, order
  preserved.
- **Rate limiter** — token bucket, produces at most `ratePerSec` items/sec
  on average.
- **Barrier** — `N`-party, all callers block until `N` have arrived.
- **MPMC queue** — bounded, blocking enqueue and timeout-based dequeue.
- **Parallel reduce** — splits into `P` chunks, each reduced sequentially,
  then combined; must equal sequential `reduce` for an associative op.

## Memory model

Scala reuses the JMM (JSR-133). There is no separate Scala memory model
spec. `volatile` in Scala is `scala.volatile`, an annotation that expands
to the JVM `volatile` field modifier. For happens-before reasoning, read
the Java chapter.
