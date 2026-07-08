package com.learning.`04_sealed_adts`.v3

/**
 * Scala 3 ADT 的两种表达：
 *   - sealed trait + case class（与 Scala 2 兼容,继续可用）
 *   - 新增 `enum` 关键字,直接表达枚举,语法更紧凑
 *
 * 编译期 exhaustiveness 比 Scala 2 更严格：未覆盖分支会**报错**而非警告。
 */
object ADTs:

  // 枚举：每个 case 构造时可携带参数,自动得到模式匹配能力
  enum Json:
    case JsonNull
    case JsonBool(b: Boolean)
    case JsonNum(n: BigDecimal)
    case JsonStr(s: String)
    case JsonArr(items: List[Json])
    case JsonObj(fields: Map[String, Json])

  object Json:
    def render(j: Json): String = j match
      case JsonNull           => "null"
      case JsonBool(b)        => b.toString
      case JsonNum(n)         => n.toString
      case JsonStr(s)         => "\"" + s + "\""
      case JsonArr(items)     => items.map(render).mkString("[", ",", "]")
      case JsonObj(fields)    =>
        fields.map { case (k, v) => "\"" + k + "\":" + render(v) }.mkString("{", ",", "}")

  // 通用枚举 + 参数化变体
  enum Tree[+A]:
    case Leaf(value: A)
    case Branch(left: Tree[A], right: Tree[A])

  object Tree:
    def size[A](t: Tree[A]): Int = t match
      case Leaf(_)        => 1
      case Branch(l, r)   => 1 + size(l) + size(r)

    // 用 enum 的 `derived` 风格获取"中序遍历"
    def inOrder[A](t: Tree[A]): List[A] = t match
      case Leaf(v)        => List(v)
      case Branch(l, r)   => inOrder(l) ++ inOrder(r)

  // 简单枚举（无参数）
  enum Color:
    case Red, Green, Blue

  // 带字段的枚举
  enum Planet(mass: Double, radius: Double):
    case Mercury extends Planet(3.30e23, 2.44e6)
    case Venus   extends Planet(4.87e24, 6.05e6)
    case Earth   extends Planet(5.97e24, 6.37e6)

    def surfaceGravity: Double = 6.67e-11 * mass / (radius * radius)
