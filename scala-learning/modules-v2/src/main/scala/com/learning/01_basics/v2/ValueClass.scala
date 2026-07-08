package com.learning.`01_basics`.v2

import scala.annotation.implicitNotFound

/**
 * Scala 2 基础类型与字面量演示。
 *
 * Scala 2 的类型系统建立在 `Any → AnyVal / AnyRef` 的二分之上：
 *   - AnyVal 是值类型，运行时映射为 JVM 基本类型
 *   - AnyRef 是引用类型，对应 java.lang.Object
 *
 * 重要概念：
 *   - Unit / Null / Nothing 是底类型
 *   - 字符串插值 s""、f""、raw"" 三种
 *   - 字面量后缀 L, f, d 等
 *   - 数值字面量支持 `_` 分隔（2.13+）
 */
object BasicsDemo {

  // 字面量与下划线分隔符（2.13+）
  val oneMillion: Long   = 1_000_000L
  val piApprox:  Double  = 3.141_592_653_589_793
  val hexByte:   Int     = 0xFF
  val binMask:   Int     = 0b1010_1010

  // 字符串插值
  def interpolate(name: String, age: Int): String = {
    val s1 = s"name=$name, age=$age"            // 普通插值
    val s2 = f"age=%04d, pi=%.3f"                // 格式化插值
    val s3 = raw"a\nb"                          // 不转义
    s"$s1 | $s2 | $s3"
  }

  // Nothing 用作永不返回的提示
  def fail(msg: String): Nothing = throw new IllegalStateException(msg)

  // 隐式值类型转换包装 —— 在 Scala 2 中,扩展方法的标准形式是 implicit class
  implicit class RichInt(val self: Int) extends AnyVal {
    def doubled: Int = self * 2
    def squared: Int = self * self
  }

  // 隐式值类型参数上下文（Scala 2 风格）
  @implicitNotFound("Cannot find Ordering for ${T}")
  trait Ord[T] { def compare(x: T, y: T): Int }

  implicit val intOrd: Ord[Int] = (x, y) => java.lang.Integer.compare(x, y)
  implicit def stringOrd: Ord[String] = (x, y) => x.compareTo(y)

  // 上下文约束：使用 Ordering 时 T 必须在隐式作用域内有 Ord[T]
  def max[T](x: T, y: T)(implicit ev: Ord[T]): T =
    if (ev.compare(x, y) >= 0) x else y

  // 上下文绑定语法糖：[T: Ord] 等价于 (implicit ev: Ord[T])
  def sortedFirst[T: Ord](xs: List[T]): T = xs.reduceLeft((a, b) => max(a, b))
}

/**
 * 用户 ID —— 演示 Scala 2 中的值类（extends AnyVal）。
 *
 * 值类会在编译期消除包装,运行时即 `Long`。
 * 限制：必须只有一个 val 构造参数；不能扩展其他 trait 之外的能力；不能用于类型参数位置。
 *
 * `@specialized` 让泛型特化到原始类型,避免装箱。
 */
final class UserId(val raw: Long) extends AnyVal {
  override def toString: String = s"UserId($raw)"
}

object UserId {
  def unsafe(raw: Long): UserId = new UserId(raw)
  def parse(s: String): Option[UserId] =
    if (s.matches("[0-9]+")) Some(new UserId(s.toLong)) else None
}

/**
 * 演示 `@specialized` —— 泛型方法对原始类型去装箱。
 */
object SpecializationDemo {
  // 对 T 特化到常见原始类型
  def identity[@specialized(Int, Long, Double) T](x: T): T = x

  // 运行：identity(42) 与 identity(42L) 都不会装箱成 java.lang.Integer / Long
  def run(): Unit = {
    val a: Int    = identity(42)
    val b: Long   = identity(42L)
    val c: Double = identity(3.14)
    assert(a == 42 && b == 42L && c == 3.14)
  }
}
