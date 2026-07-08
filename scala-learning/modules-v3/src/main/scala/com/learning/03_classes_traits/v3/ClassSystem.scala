package com.learning.`03_classes_traits`.v3

/**
 * Scala 3 类与特质系统:
 *   - 主构造器语法与 Scala 2 兼容,但更推荐 `private val` 显式可见性
 *   - `open` 修饰符让类可被外部继承（默认 final 除非显式 open）
 *   - 抽象类型成员与 Scala 2 相同
 *   - 自身类型 `self: T =>` 仍然可用
 *   - 特质线性化规则不变
 *   - `export` 取代 `package object`,把成员重新导出
 *   - 顶级定义：trait / class / object 可写在文件顶层,不需包对象
 */
object ClassSystem:

  // 抽象类型成员
  trait Container:
    type T
    def add(elem: T): Unit
    def get(idx: Int): T

  class StringContainer extends Container:
    type T = String
    private var data = Vector.empty[String]
    def add(elem: String): Unit = data = data :+ elem
    def get(idx: Int): String   = data(idx)

  // 自身类型
  trait Persistable:
    self: Container =>          // self-type 要求混入 Container
    def save(): String = s"persisting ${get(0)}"

  // 特质线性化
  trait Logged:
    def log(msg: String): Unit = println(s"[log] $msg")

  trait TimestampLogged extends Logged:
    abstract override def log(msg: String): Unit =
      super.log(s"${System.currentTimeMillis()} $msg")

  trait Audited extends Logged:
    abstract override def log(msg: String): Unit =
      super.log(s"[audit] $msg")

  open class Service extends TimestampLogged, Audited:
    def run(): Unit = log("started")

// ----------------------------------------------------------------------------
// 替代 Scala 2 package object 的方式:
//   1. 顶级定义:type / val 直接写在文件顶层(不再需要 package object)
//   2. 子包 + export 把其他对象的成员"代理"到当前作用域
//   3. 消费方通过 import 子包路径直接引用
// ----------------------------------------------------------------------------
package types:
  type StringMap = Map[String, String]
  val Empty: StringMap = Map.empty
  val defaultGreeting: String = "Hello"
