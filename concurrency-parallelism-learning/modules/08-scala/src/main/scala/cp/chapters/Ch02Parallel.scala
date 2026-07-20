package cp.chapters

import scala.collection.parallel.CollectionConverters.*
import scala.concurrent.duration.*
import scala.concurrent.{Await, Future}
import scala.concurrent.ExecutionContext.Implicits.global

/** Ch02 — Parallel collections.
  *
  * `.par` on a Scala collection returns a `ParSeq[A]` whose operations
  * are dispatched on the common `ForkJoinPool`. Use it for CPU-bound
  * bulk operations. Don't use it on tiny collections (overhead) or on
  * side-effecting operations (it will reorder them silently).
  */
object Ch02Parallel:

  def p1_parallelMap(): Long =
    val n = 1_000_000
    val xs = (1 to n).toVector
    val t0 = System.nanoTime()
    val ys = xs.par.map(i => math.sqrt(i.toDouble)).toVector
    val took = (System.nanoTime() - t0) / 1_000_000
    assert(ys.length == n)
    took

  def p2_parallelReduce(): Long =
    val n = 10_000_000
    val xs = (1 to n).toVector
    val t0 = System.nanoTime()
    val s = xs.par.foldLeft(0L)(_ + _)
    val took = (System.nanoTime() - t0) / 1_000_000
    assert(s == (n.toLong * (n + 1L)) / 2L)
    took

  def p3_aggregateForNonAssociativeFold(): Int =
    // aggregate is associative-aware: seqop combines within a partition,
    // combop combines partitions.
    val xs = (1 to 1000).toVector
    xs.par.aggregate(0)(_ + _, _ + _)
