package com.learning.`13_concurrency`.v3

import scala.concurrent.{ExecutionContext, Future, Await}
import scala.concurrent.duration.*
import java.util.concurrent.Executors

/**
 * Scala 3 并发:
 *   - API 与 Scala 2 完全兼容
 *   - ExecutionContext 可作为 `using` 参数;不再需要隐式作用域导入
 *   - `scala.collection.parallel` 仍可用
 */
object Concurrency:

  // given ExecutionContext:为同包调用方自动解析 using ec
  given testEc: ExecutionContext = ExecutionContext.fromExecutor(
    Executors.newFixedThreadPool(2)
  )

  def addAsync(a: Int, b: Int)(using ec: ExecutionContext): Future[Int] =
    Future {
      Thread.sleep(10)
      a + b
    }

  def combine(as: List[Int])(using ec: ExecutionContext): Future[Int] =
    Future.traverse(as)(addAsync(_, 1)).map(_.sum)

  def safeDivide(a: Int, b: Int)(using ec: ExecutionContext): Future[Int] =
    Future(a / b).recover { case _: ArithmeticException => 0 }

  def parallelMap(xs: Vector[Int], f: Int => Int): Vector[Int] =
    xs.par.map(f).toVector

  def await[A](fa: Future[A], atMost: FiniteDuration = 5.seconds): A =
    Await.result(fa, atMost)
