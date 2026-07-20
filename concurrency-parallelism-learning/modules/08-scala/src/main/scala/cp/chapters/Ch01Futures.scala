package cp.chapters

import java.util.concurrent.{Callable, Executors, TimeUnit}
import scala.concurrent.duration.*
import scala.concurrent.{Await, ExecutionContext, Future, Promise}
import scala.util.{Failure, Success, Try}

/** Ch01 — Future / Promise / ExecutionContext.
  *
  * A `Future[T]` is *not* a task; it is a *read-side handle* to one. A
  * `Promise[T]` is the write side. The actual work is submitted to an
  * `ExecutionContext`, which is just a `(Runnable) => Unit` plus a way to
  * report failures. Scala's default `ExecutionContext.global` is a
  * `ForkJoinPool`.
  *
  * The two key rules:
  *   1. The body of `Future { ... }` must be non-blocking. If you have to
  *      block, use a dedicated `ExecutionContext` backed by a fixed-size
  *      `Executors.newFixedThreadPool`. Mixing blocking work into the FJP
  *      starves everyone else.
  *   2. The `Future` body may run on any thread; in particular, *do not
  *      capture mutable state in it without synchronisation*. `Future`
  *      composes are not atomic; the JMM says nothing.
  */
object Ch01Futures:

  // ---- the read/write split ----
  def p1_promiseIsWriteSideFutureIsReadSide(): Unit =
    val p = Promise[Int]()
    val f: Future[Int] = p.future          // f is the read side
    p.success(42)                          // write side fires
    assert(Await.result(f, 1.second) == 42)

  // ---- ExecutionContext: the scheduler is a value ----
  def p2_dedicatedBlockingPool(): Unit =
    given ExecutionContext =
      ExecutionContext.fromExecutor(Executors.newFixedThreadPool(4))
    val fs = (1 to 100).map(i => Future {
      // a "blocking" demo: pretend we are calling a JDBC driver
      Thread.sleep(1)
      i * i
    })
    val sum = Future.sequence(fs).map(_.sum)
    assert(Await.result(sum, 5.seconds) == (1 to 100).map(i => i * i).sum)

  // ---- failure propagation ----
  def p3_failurePropagates(): Unit =
    val f = Future { sys.error("boom") }
    val recovered = f.recover { case e: RuntimeException => -1 }
    assert(Await.result(recovered, 1.second) == -1)

  // ---- andThen: side-effect-only, never observes the value ----
  def p4_andThenIsFireAndForget(): Unit =
    var observed = 0
    val f = Future { 10 }.andThen { case Success(v) => observed = v }
    Await.ready(f, 1.second)
    assert(observed == 10)

  // ---- combine two futures into one ----
  def p5_zip(): Unit =
    given ExecutionContext = ExecutionContext.global
    val a = Future { 1 }
    val b = Future { 2 }
    assert(Await.result(a.zip(b), 1.second) == (1, 2))
