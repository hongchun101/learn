# M04 密封特质与 ADT

## 演示特性

- `sealed trait` 限制同文件派生
- `case class` 自动 equals/hashCode/copy/模式匹配
- `case object` 单例
- Scala 2: `object X extends Enumeration` 风格枚举
- Scala 3: `enum X:` 新语法,每个 case 可携带参数

## Scala 2 vs Scala 3 关键差异

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| 枚举语法 | `object Color extends Enumeration` | `enum Color: case Red, Green` |
| 枚举带参数 | 需要 case class 派生 | `enum X: case Foo(v: Int)` |
| exhaustiveness | 警告 | **错误**(Scala 3.3+) |

## 演示文件

- v2: `ADTs.scala` 用 sealed trait + case class 实现 Json、Tree
- v3: `ADTs.scala` 用 enum 实现 Json、Tree,带字段的 Planet

## 注意

- Scala 3 enum 中,case 之间相互可见;case 字段用 `case Foo(v: T)` 形式
- 嵌套 enum case 可直接用 `EnumName.Case`
- 与 case class 不同,enum case 不接受类型参数(类型参数由 enum 拥有)
