package com.learning.`04_sealed_adts`.v2

/**
 * Scala 2 代数数据类型 (ADT)：
 *   - sealed trait 限制子类必须在同一文件内派生
 *   - case class 自动获得 equals/hashCode/copy/模式匹配
 *   - 编译期 exhaustiveness 检查（对 sealed trait 的 match 给出警告）
 *   - 经典应用：Json、Ast、Option、Either 的实现
 */
object ADTs {

  // 一个微型 JSON ADT
  sealed trait Json
  case object JsonNull                                     extends Json
  case class  JsonBool(b: Boolean)                         extends Json
  case class  JsonNum(n: BigDecimal)                       extends Json
  case class  JsonStr(s: String)                           extends Json
  case class  JsonArr(items: List[Json])                   extends Json
  case class  JsonObj(fields: Map[String, Json])           extends Json

  // 递归求值
  def render(j: Json): String = j match {
    case JsonNull              => "null"
    case JsonBool(b)           => b.toString
    case JsonNum(n)            => n.toString
    case JsonStr(s)            => "\"" + s + "\""
    case JsonArr(items)        => items.map(render).mkString("[", ",", "]")
    case JsonObj(fields)       =>
      fields.map { case (k, v) => "\"" + k + "\":" + render(v) }.mkString("{", ",", "}")
  }

  // 二叉树
  sealed trait Tree[+A]
  case class Leaf[A](value: A)                       extends Tree[A]
  case class Branch[A](left: Tree[A], right: Tree[A]) extends Tree[A]

  def size[A](t: Tree[A]): Int = t match {
    case Leaf(_)            => 1
    case Branch(l, r)       => 1 + size(l) + size(r)
  }

  // Scala 2 枚举（注意与 case object 的区别 —— 枚举可序列化名字）
  object Color extends Enumeration {
    val Red, Green, Blue = Value
  }
}
