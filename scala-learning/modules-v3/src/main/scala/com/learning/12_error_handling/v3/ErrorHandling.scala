package com.learning.`12_error_handling`.v3

import scala.util.{Try, Success, Failure}
import scala.util.control.NonFatal

/**
 * Scala 3 错误处理:
 *   - Try / Either API 与 Scala 2 相同
 *   - 新增 `CanThrow` 能力,允许 unsafe 抛异常但被 `safe` 包装
 *   - `scala.util.control.Exception` 仍可用
 *   - for 推导在 Try / Either / Option 上一致
 */
object ErrorHandling:

  def parseInt(s: String): Try[Int] = Try(s.toInt)

  enum AppError:
    case NotFound(what: String)
    case Invalid(reason: String)
    case Unauthorized

  def loadUser(id: Long): Either[AppError, String] =
    if id < 0 then Left(AppError.NotFound(s"user $id"))
    else if id == 0 then Left(AppError.Unauthorized)
    else Right(s"User#$id")

  import scala.util.control.Exception.*
  val safeParseInt: String => Either[Throwable, Int] =
    catching[Int] either (_.toInt)

  def workflow(id: Long, raw: String): Either[AppError, Int] =
    for
      name <- loadUser(id)
      n    <- parseInt(raw).toEither.left.map(e => AppError.Invalid(e.getMessage))
    yield n + name.length

  def multiStep(xs: List[String]): Try[Int] =
    Try(xs.map(_.toInt).sum)

  def isFatal(t: Throwable): Boolean = !NonFatal(t)
