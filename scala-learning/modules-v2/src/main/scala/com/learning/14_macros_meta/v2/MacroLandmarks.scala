package com.learning.`14_macros_meta`.v2

import scala.annotation.{implicitNotFound, nowarn, showAsInfix, StaticAnnotation}
import scala.beans.BeanProperty

/**
 * Scala 2 宏(宏)景观 —— 演示与导览
 *
 * Scala 2 的宏机制（macro）允许在编译期生成代码。
 * 真实宏编写需要 macro paradise 插件或 macro-compat；本模块聚焦于
 * "宏能做什么"的可见效果与 Scala 2.13 内置的注解宏（annotation macro）。
 *
 * 核心概念：
 *   - def 宏：白盒（Whitebox）/ 黑盒（Blackbox）宏
 *   - annotation 宏：编译期把注解替换为代码
 *   - quasiquotes：使用类似 AST 的方式构造代码
 *
 * 演示:
 *   - `@BeanProperty` 注解宏（自动生成 getter/setter）
 *   - `@implicitNotFound` 编译期诊断
 *   - `@nowarn` 静默特定警告
 *   - `@showAsInfix` 允许类型以中缀展示
 *   - `@compileTimeOnly` —— 真实宏注解（仅在编译期可用的 API）
 */
object MacroLandmarks {

  // @BeanProperty 自动生成 getXxx / setXxx
  class UserAccount {
    @BeanProperty var balance: Double = 0.0
  }

  // 自定义注解 + @compileTimeOnly:参数必须是字面量,编译期检查
  class describe(val name: String) extends StaticAnnotation

  // 编译期错误：标注的方法只能在编译期被调用
  // Scala 2 标准库通过 macro 实现此检查
  @nowarn("cat=unused") // 静默 unused 警告
  def silence(): Unit = ()

  // 自定义中缀展示的类型
  @showAsInfix
  class |+|[A, B](left: A, right: B)

  // 隐式查找失败时的友好错误
  @implicitNotFound("Cannot find Ordering for ${T} —— please import an instance or define one")
  trait Ord[T] { def compare(x: T, y: T): Int }

  // 真实"宏"入口：演示 quasiquotes 的 AST 构造思路
  // 实际宏(白盒/黑盒)需要 macro paradise,这里仅展示 API 形态
  def quasiquoteSketch(): String = {
    // 真实宏代码:
    //   import scala.reflect.macros.blackbox.Context
    //   def impl(c: blackbox.Context)(xs: c.Expr[Int]*) =
    //     q"[..xs.map(x => q"$x + 1")]"
    // 此处仅展示调用方代码
    s"quasiquote sketch — see MacroParadise for full impl"
  }
}
