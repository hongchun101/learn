package com.learning.`13_concurrency`.v2

import scala.concurrent.{ExecutionContext, Future, Await}
import scala.concurrent.duration._
import java.util.concurrent.Executors

/**
 * Scala 2 并发:
 *   - Future[A] 表达异步计算
 *   - ExecutionContext 决定执行线程模型(implicit 参数)
 *   - for 推导串联异步操作
 *   - recover / recoverWith 处理失败
 *   - 并行集合 par(Scala 2.13)
 */
object Concurrency {

  // 自定义 ExecutionContext(在测试中可控制执行器)
  // implicit val:同包调用方 `import Concurrency._` 后自动获得 ExecutionContext
  implicit val testEc: ExecutionContext = ExecutionContext.fromExecutor(
    Executors.newFixedThreadPool(2)
  )

  // 异步加法
  def addAsync(a: Int, b: Int)(implicit ec: ExecutionContext): Future[Int] =
    Future {
      Thread.sleep(10)
      a + b
    }

  // 组合多个 Future
  def combine(as: List[Int])(implicit ec: ExecutionContext): Future[Int] =
    Future.traverse(as)(addAsync(_, 1)).map(_.sum)

  // 恢复
  def safeDivide(a: Int, b: Int)(implicit ec: ExecutionContext): Future[Int] =
    Future(a / b).recover { case _: ArithmeticException => 0 }

  // 并行集合
  def parallelMap(xs: Vector[Int], f: Int => Int): Vector[Int] =
    xs.par.map(f).toVector

  // 串行等待 —— 仅用于测试
  def await[A](fa: Future[A], atMost: FiniteDuration = 5.seconds): A =
    Await.result(fa, atMost)
}
