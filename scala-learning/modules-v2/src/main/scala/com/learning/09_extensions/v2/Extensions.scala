package com.learning.`09_extensions`.v2

/**
 * Scala 2 扩展方法：使用 `implicit class`。
 *
 * 关键点:
 *   - 必须是单构造器参数 + AnyVal 子类(零成本)
 *   - 同一包内导入后即可使用中缀语法
 *   - 多个 implicit class 解析:如果存在冲突,编译器报错"ambiguous implicit values"
 */
object Extensions {

  // 给 Int 扩展
  implicit class IntOps(val self: Int) extends AnyVal {
    def times(f: Int => Unit): Unit = {
      var i = 0
      while (i < self) { f(i); i += 1 }
    }
  }

  // 给 String 扩展
  implicit class StringOps(val s: String) extends AnyVal {
    def toSnake: String   = s.replaceAll("([A-Z])", "_$1").toLowerCase
    def words: List[String] = s.split("\\s+").toList
  }

  // 给 List[A] 扩展
  implicit class ListOps[A](val xs: List[A]) extends AnyVal {
    def second: Option[A] = xs.drop(1).headOption
    def secondOr[B >: A](default: B): B = xs.drop(1).headOption.getOrElse(default)
  }

  // 顶层 implicit class 不带 AnyVal 包装
  implicit class RegexOps(val s: String) {
    def isEmail: Boolean = s.matches("^[\\w.]+@[\\w.]+$")
  }
}
