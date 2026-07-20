package cp.chapters

import zio.*
import zio.stm.*

import java.util.concurrent.atomic.AtomicInteger

/** Ch05 — ZIO concurrency.
  *
  * ZIO's concurrency story is "structured + interruptible + composable".
  * The three primitives that show up everywhere:
  *
  *   - `Fiber` — a running effect, like a `Thread` for ZIO. Cheap (a
  *     few hundred bytes; you can have millions).
  *   - `Ref[A]` — a concurrent, *transactional* reference. `update` is
  *     a CAS loop. `Ref.Synchronized` adds a queue of update requests
  *     processed in order.
  *   - `ZSTM[A]` — Software Transactional Memory, like Clojure's STM.
  *     Composable atomic updates with automatic retry on conflict.
  *
  * Other essentials covered here: `Queue[A]`, `Hub[A]` (pub/sub),
  * `Promise[E, A]`, `Semaphore`, `Schedule`, `FiberRef`, `ZLayer`.
  */
object Ch05ZioConcurrency:

  // ---- 1. fork / join / interrupt ----
  def forkJoin(): UIO[Int] =
    for
      fiber <- ZIO.succeed(42).fork
      v     <- fiber.join
    yield v

  def interruptibleRegion(): UIO[Unit] =
    for
      fiber <- ZIO.attemptBlockingInterrupt(Thread.sleep(60_000)).fork
      _     <- ZIO.sleep(100.millis)
      _     <- fiber.interrupt
      _     <- fiber.await   // Exit.Failure(Interrupted)
    yield ()

  // ---- 2. Ref: the workhorse ----
  def refCounter(): UIO[Unit] =
    for
      ref  <- Ref.make(0)
      _    <- ZIO.foreachParDiscard((1 to 1000).toList)(_ => ref.update(_ + 1))
      v    <- ref.get
      _    <- ZIO.succeed(assert(v == 1000))
    yield ()

  // ---- 3. STM: the principled alternative ----
  def stmTransfer(): UIO[Long] =
    for
      a     <- TRef.make(1000L).commit
      b     <- TRef.make(0L).commit
      _     <- ZIO.foreachDiscard((1 to 1000).toList)(_ =>
                 STM.atomically {
                   for
                     av <- a.get
                     _  <- a.set(av - 1)
                     bv <- b.get
                     _  <- b.set(bv + 1)
                   yield ()
                 })
      finalA <- a.get.commit
    yield finalA

  // ---- 4. Semaphore: backpressure ----
  def withPermit(n: Int): UIO[Int] =
    for
      sem    <- Semaphore.make(n)
      result <- ZIO.foreachParDiscard((1 to 1000).toList)(_ =>
                  sem.withPermit(ZIO.succeed(1))) *>
                  ZIO.succeed(0)
    yield result

  // ---- 5. Hub: pub/sub ----
  def hubDemo(): UIO[Int] =
    for
      hub  <- Hub.bounded[Int](16)
      _    <- hub.subscribe
      _    <- hub.publish(1)
      _    <- hub.publish(2)
      _    <- hub.publish(3)
      q    <- ZIO.foreachParN(2)(List(1, 2, 3))(_ => hub.subscribe.map(_.take))
                .map(_.flatten)
    yield q.size
