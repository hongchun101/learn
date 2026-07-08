package com.learning.`01_basics`.v3

/**
 * Scala 3 基础类型与零成本抽象 —— `opaque type`。
 *
 * Scala 3 的核心改进：
 *   - `opaque type` 在文件内是底层类型的别名（编译期消除包装）,
 *     在文件外是真正的全新类型（类型安全）—— 兼顾了值类的零成本与类型别名的人体工学
 *   - 顶级定义：trait / class / object 可不写在 object 内
 *   - `transparent inline` 允许内联函数返回更精确的类型
 *   - `Matchable` 是 Scala 3 中所有可被 match 类型的通用父类（取代 Any 的可匹配子集）
 *   - `inline if` 编译期分支
 */
object BasicsDemo {

  // 字面量（与 Scala 2 兼容）
  val oneMillion: Long   = 1_000_000L
  val piApprox:  Double  = 3.141_592_653_589_793
  val hexByte:   Int     = 0xFF
  val binMask:   Int     = 0b1010_1010

  // Scala 3 的多行字符串与插值
  def interpolate(name: String, age: Int): String = {
    val s1 = s"name=$name, age=$age"
    val s2 = f"age=$age%04d, pi=$piApprox%.3f"
    val s3 = raw"a\nb"
    s"$s1 | $s2 | $s3"
  }

  // Nothing 仍是永不返回的标记
  def fail(msg: String): Nothing = throw new IllegalStateException(msg)
}

// ----------------------------------------------------------------------------
// opaque type —— 文件外不可见底层类型,文件内是别名,零运行时开销
// ----------------------------------------------------------------------------
object UserIdModule {

  opaque type UserId = Long

  // 同文件内,UserId 与 Long 可互换使用;出文件后必须通过 companion 转换
  object UserId {
    def apply(raw: Long): UserId       = raw
    extension (id: UserId) def raw: Long = id
    def parse(s: String): Option[UserId] =
      if s.matches("[0-9]+") then Some(s.toLong) else None
  }

  // 内部可直接相加：文件内 UserId ≡ Long
  def nextId(prev: UserId): UserId = prev + 1L
}

// ----------------------------------------------------------------------------
// transparent inline —— 编译期把抽象消除,并把精确类型暴露给调用方
// ----------------------------------------------------------------------------
object Constants {
  // 编译后,scalaVersion 字符串直接出现在调用点,无任何方法调用
  transparent inline def scalaVersion: String = "3.3.3"

  // inline if —— 编译期条件,生成死代码消除
  inline def platform: String =
    inline if scala.util.Properties.isMac then "mac" else "other"
}

// ----------------------------------------------------------------------------
// Matchable —— Scala 3 中"可作为模式匹配对象"的最弱保证
// ----------------------------------------------------------------------------
object MatchableDemo {
  // 在 Scala 3 中,Matchable 是 Any 下的可匹配类型;具体类型默认混入 Matchable
  // 实际上,Scala 3 编译器允许在 match 中匹配 Any 下的任意类型,这里仅展示 match 语法
  def describe(a: Any): String = a match {
    case s: String => s"String: $s"
    case i: Int    => s"Int: $i"
    case _         => "other"
  }
}
