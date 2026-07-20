package cp.chapters

import java.util.concurrent.atomic.AtomicInteger
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{Await, Future}
import scala.concurrent.duration.*

/** Ch08 — Scala/JVM memory model cheatsheet.
  *
  * Scala has no separate memory model. The rules of the Java Memory
  * Model (JSR-133) apply. The cheats:
  *
  *   1. `volatile` (annotation `@scala.volatile`, keyword on Java fields
  *      from Scala 3) — read/write establishes happens-before with the
  *      next access.
  *   2. `synchronized` — entry to a monitor synchronizes-with exit
  *      from the same monitor.
  *   3. `final` fields have a special freeze rule; reading a `final`
  *      field after the constructor *must* see the fully-constructed
  *      object (safe-publication).
  *   4. `java.util.concurrent` — every class documents which happens-
  *      before edges it establishes. `AtomicInteger` is a volatile int.
  *      `ConcurrentHashMap` is a has-table with internal locks.
  *   5. `Future` composes are NOT atomic. Each `map`/`flatMap` runs in
  *      a separate `Runnable`; reads of shared state in them are racy.
  *      Always use `Atomic*` or locks.
  */
object Ch08MemoryModel:

  def p1_volatile(): Unit =
    @scala.volatile var running = true
    val t = new Thread(() => { running = false })
    t.start()
    t.join()
    assert(!running)        // happens-before guaranteed by Thread#join

  def p2_atomicCounter(): Unit =
    val counter = new AtomicInteger(0)
    val futures = (1 to 1000).map(_ => Future(counter.incrementAndGet()))
    Await.ready(Future.sequence(futures), 5.seconds)
    assert(counter.get() == 1000)

  def p3_finalFieldSafePublish(): Unit =
    // Demonstrate the "this escape" anti-pattern: do not pass `this` to
    // another thread from the constructor. A `final` field is only
    // safely published AFTER the constructor returns.
    class Counter:
      final val value: Int = 42
    val c = new Counter
    val v = Future(c.value)
    assert(Await.result(v, 1.second) == 42)
