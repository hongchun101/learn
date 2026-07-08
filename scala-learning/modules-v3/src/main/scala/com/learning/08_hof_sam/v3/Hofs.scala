package com.learning.`08_hof_sam`.v3

/**
 * Scala 3 高阶函数与 SAM：
 *   - 函数类型语法不变: (A1, ..., AN) => R
 *   - 改进:SAM 类型现在能保留具体 lambda 的"精确类型"——以前会被擦为通用 FunctionN
 *   - `using` 与高阶函数结合更优雅
 *   - 闭包语义与 Scala 2 相同
 */
object Hofs:

  // 函数复合
  def compose[A, B, C](f: B => C, g: A => B): A => C =
    a => f(g(a))

  // 折叠
  def foldLeft[A, B](xs: List[A])(z: B)(op: (B, A) => B): B = xs match
    case Nil    => z
    case h :: t => foldLeft(t)(op(z, h))(op)

  val isEven: Int => Boolean = _ % 2 == 0
  val doubled: Int => Int    = _ * 2
  val keep: Int => Boolean   = isEven

  // SAM trait —— Scala 3 维持自动 SAM 转换
  trait Transformer[A, B]:
    def transform(a: A): B
  val intToStr: Transformer[Int, String] = (a: Int) => s"value=$a"

  // 偏应用
  val add: (Int, Int) => Int = _ + _
  val add5: Int => Int       = add(5, _)
  val plus5: Int => Int      = add(_: Int, 5)

  def makeCounter(): () => Int =
    var n = 0
    () => { n += 1; n }

  // Scala 3 独有:在参数位置使用 `=>` 自动解包
  def defer(action: => Unit): Unit =
    () => action // 用 thunk 包装
