package com.learning.`12_error_handling`.v2

import scala.util.{Try, Success, Failure}
import scala.util.control.NonFatal

/**
 * Scala 2 错误处理模型:
 *   - `Try[A]` 包装可能抛异常的代码:Success / Failure
 *   - `Either[L, R]` 表达显式错误
 *   - `scala.util.control.NonFatal` 区分致命与非致命异常
 *   - `scala.util.control.Exception.catching` / `catchingPromiscuously` 提供 DSL
 *   - Try 不参与 for-推导的自动 short-circuit(Scala 2 早期不支持)
 *     但可借助 toOption / toEither 转换
 */
object ErrorHandling {

  // Try + 模式匹配
  def parseInt(s: String): Try[Int] = Try(s.toInt)

  // Either
  sealed trait AppError
  case class NotFound(what: String)         extends AppError
  case class Invalid(reason: String)        extends AppError
  case object Unauthorized                  extends AppError

  def loadUser(id: Long): Either[AppError, String] =
    if (id < 0) Left(NotFound(s"user $id"))
    else if (id == 0) Left(Unauthorized)
    else Right(s"User#$id")

  // 控制结构:用 scala.util.control.Exception 包装
  val catching: NonFatal.type = NonFatal

  // 完整 DSL:把一组异常翻译成 Either
  import scala.util.control.Exception._
  val safeParseInt: String => Either[Throwable, Int] =
    catching[Int] either (_.toInt) // catching 适用于受检异常;JVM 普遍非受检

  // 在 Either 上 for
  def workflow(id: Long, raw: String): Either[AppError, Int] = {
    for {
      name <- loadUser(id)
      n    <- parseInt(raw).toEither.left.map(e => Invalid(e.getMessage))
    } yield n + name.length
  }

  // Try 收集多步
  def multiStep(xs: List[String]): Try[Int] =
    Try(xs.map(_.toInt).sum)

  // NonFatal 区分
  def isFatal(t: Throwable): Boolean = !NonFatal(t)
}
