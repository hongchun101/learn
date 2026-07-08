# M07 模式匹配

## 演示特性

- 字面量模式、通配符 `_`、变量绑定 `@`
- 类型模式 `x: T`
- 构造器模式(case class)
- 提取器模式:`unapply` / `unapplySeq`
- 模式守卫 `if cond`
- 模式替代 `|`
- 嵌套模式
- 稳定标识符规则

## Scala 2 vs Scala 3 关键差异

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| 大写标识符 | `case UPPER` 视为常量,`case lower` 视为变量 | 全部 val 都视为 stable;反引号强制变量 |
| exhaustiveness | 警告 | **错误** |
| 守卫 | `case x if cond =>` | 同 + `case x if cond then` 风格可选 |

## 演示文件

- `Patterns.scala` 含 `Even` 提取器、`Split` 序列提取器、`Person` case class 守卫
- 测试覆盖所有匹配模式

## 自定义提取器

```scala
object Even:
  def unapply(n: Int): Option[Int] = if n % 2 == 0 then Some(n) else None

object Split:
  def unapplySeq(s: String): Option[List[String]] = Some(s.split(",").toList)
```

## 何时用模式匹配 vs 字段访问

- 模式匹配解构(只对 case class / sealed trait 最优)
- 大量数据访问用字段访问;模式匹配用于控制流分支
