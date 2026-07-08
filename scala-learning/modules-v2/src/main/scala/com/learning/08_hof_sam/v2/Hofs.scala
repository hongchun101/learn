package com.learning.`08_hof_sam`.v2

/**
 * Scala 2 高阶函数与 SAM：
 *   - 函数类型:FunctionN[-A1, ..., -AN, +R] 也写作 (A1, ..., AN) => R
 *   - 函数可作为参数 / 返回值
 *   - 自动 SAM（Single Abstract Method）转换：
 *     trait Runnable { def run(): Unit }
 *     val r: Runnable = () => println("ok")   // Scala 2.12+ 自动
 *   - 闭包捕获:可捕获外层变量形成闭包
 *   - 偏应用函数:用 _ 占位
 */
object Hofs {

  // 函数复合
  def compose[A, B, C](f: B => C, g: A => B): A => C =
    a => f(g(a))

  // 折叠
  def foldLeft[A, B](xs: List[A])(z: B)(op: (B, A) => B): B = xs match {
    case Nil    => z
    case h :: t => foldLeft(t)(op(z, h))(op)
  }

  // 谓词、映射、过滤
  val isEven: Int => Boolean   = _ % 2 == 0
  val doubled: Int => Int      = _ * 2
  val keep: Int => Boolean     = isEven

  // SAM trait
  trait Transformer[A, B] { def transform(a: A): B }
  val intToStr: Transformer[Int, String] = (a: Int) => s"value=$a"

  // 偏应用
  val add: (Int, Int) => Int = _ + _
  val add5: Int => Int       = add(5, _)
  val plus5: Int => Int      = add(_: Int, 5)

  // 闭包计数器
  def makeCounter(): () => Int = {
    var n = 0
    () => { n += 1; n }
  }
}
