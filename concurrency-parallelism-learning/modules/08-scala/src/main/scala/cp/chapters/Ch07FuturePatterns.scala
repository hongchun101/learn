package cp.chapters

import scala.concurrent.duration.*
import scala.concurrent.{Await, ExecutionContext, Future, Promise}
import scala.concurrent.ExecutionContext.Implicits.global

/** Ch07 — Future-based implementations of the six cross-language tasks.
  *
  * For comparison with the ZIO versions. The bodies are the same
  * algorithm; the surface API is the standard Scala `Future`.
  */
object Ch07FuturePatterns:

  def fanOut[I, O](
    inputs:  List[I],
    workers: Int,
    work:    I => Future[O]
  ): Future[List[O]] =
    Future.sequence(inputs.map(work))

  def pipeline[A](
    source: List[A],
    stages: List[A => Future[A]]
  ): Future[List[A]] =
    Future.sequence(source.map { x =>
      stages.foldLeft(Future.successful(x))((eff, stage) => eff.flatMap(stage))
    })

  def rateLimited(ratePerSec: Int, durationMs: Long): Future[Int] =
    val intervalMs = 1000.0 / ratePerSec
    Future {
      val deadline = System.currentTimeMillis() + durationMs
      var count    = 0
      var next     = System.currentTimeMillis()
      while (System.currentTimeMillis() < deadline)
        val now = System.currentTimeMillis()
        if (now >= next) {
          count += 1
          next = now + intervalMs.toLong
        } else {
          Thread.sleep(math.max(0L, next - now))
        }
      count
    }

  def barrier(parties: Int): Future[Unit] =
    val p   = Promise[Unit]()
    val ref = new java.util.concurrent.atomic.AtomicInteger(0)
    val fs  = (1 to parties).map { _ =>
      Future {
        val n = ref.incrementAndGet()
        if (n == parties) p.success(())
        Await.ready(p.future, 1.minute)
      }
    }
    Future.sequence(fs).map(_ => ())

  def mpmcQueue[A](capacity: Int): scala.collection.mutable.Queue[A] =
    val q = scala.collection.mutable.Queue[A]()
    q

  def parallelReduce[A](
    inputs:  List[A],
    combine: (A, A) => A,
    workers: Int
  ): Future[A] =
    require(inputs.nonEmpty, "cannot reduce empty list")
    val p = math.max(1, math.min(workers, inputs.size))
    val chunks: List[List[A]] = inputs.grouped((inputs.size + p - 1) / p).toList
    Future.sequence(chunks.map(chunk => Future(chunk.reduce(combine))))
      .map(_.reduce(combine))
