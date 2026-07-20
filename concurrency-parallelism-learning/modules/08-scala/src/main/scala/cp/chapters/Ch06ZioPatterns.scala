package cp.chapters

import zio.*
import zio.stm.*

import java.util.concurrent.TimeUnit

/** Ch06 — ZIO implementations of the six cross-language tasks.
  *
  * Each function in this object corresponds to a task in
  * `src/cross-lang/contracts.ts`. The contract is identical:
  *
  *   - FanOutFanIn: input order preserved
  *   - Pipeline: per-element order preserved across stages
  *   - RateLimiter: produces at most ratePerSec items/sec on average
  *   - Barrier: N parties block until all have arrived
  *   - MpmcQueue: bounded, blocking enqueue and timeout-based dequeue
  *   - ParallelReduce: equals inputs.reduce(combine) for an associative op
  */
object Ch06ZioPatterns:

  // ---- 1. fan-out / fan-in ----
  def fanOut[I, O](
    inputs:  List[I],
    workers: Int,
    work:    I => UIO[O]
  ): UIO[List[O]] =
    ZIO.foreach(inputs)(work).withParallelism(workers)

  // ---- 2. pipeline ----
  def pipeline[A](
    source: List[A],
    stages: List[A => UIO[A]]
  ): UIO[List[A]] =
    ZIO.foreach(source) { x =>
      ZIO.foldLeft(stages)(ZIO.succeed(x))((eff, stage) => eff.flatMap(stage))
    }

  // ---- 3. rate limiter (token bucket) ----
  def rateLimited(
    ratePerSec:  Int,
    durationMs:  Long
  ): UIO[Int] =
    for
      ref       <- Ref.make(0L)
      intervalN <- ZIO.succeed(1_000_000_000L / ratePerSec)
      deadline  <- Clock.nanoTime.map(_ + durationMs * 1_000_000L)
      counter   <- Ref.make(0)
      _         <- (for
                     now      <- Clock.nanoTime
                     _        <- ZIO.when(now < deadline) {
                                 for
                                   n <- counter.updateAndGet(_ + 1)
                                   _ <- ZIO.sleep(intervalN.nanoseconds)
                                 yield ()
                               }
                   yield ()).forever.forkDaemon
      _         <- Clock.sleep(durationMs.millis)
      produced  <- counter.get
    yield produced

  // ---- 4. barrier (N parties) ----
  def barrier(parties: Int): UIO[Unit] =
    for
      p   <- Promise.make[Nothing, Unit]
      ref <- Ref.make(0)
      _   <- ZIO.foreachDiscard((1 to parties).toList)(_ =>
               for
                 n <- ref.updateAndGet(_ + 1)
                 _ <- ZIO.when(n == parties)(p.succeed(()))
                 _ <- p.await
               yield ())
    yield ()

  // ---- 5. MPMC queue ----
  def mpmcQueue[A](capacity: Int): UIO[Queue[A]] =
    Queue.bounded[A](capacity)

  // ---- 6. parallel reduce ----
  def parallelReduce[A](
    inputs:  List[A],
    combine: (A, A) => A,
    workers: Int
  ): UIO[A] =
    val p = math.max(1, math.min(workers, inputs.size))
    val chunks: List[List[A]] = inputs.grouped((inputs.size + p - 1) / p).toList
    for
      partials <- ZIO.foreachParN(p)(chunks)(chunk =>
                    ZIO.succeed(chunk.reduce(combine)))
    yield partials.reduce(combine)
