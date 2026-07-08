# M10 操作符重载 / Numeric / Ordering

## 演示特性

- 自定义中缀方法:`a + b`、`a dot b`
- 一元方法:`unary_-` / `unary_+` / `unary_!` / `unary_~`
- `apply` / `update` 模拟 `a(i)` 与 `a(i) = b`
- 自定义 `Ordering[T]` 实例
- `transparent inline` 包装代数类型

## Scala 2 vs Scala 3

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| 操作符命名 | 同 | 同 |
| 一元方法 | `unary_-` | 同 |
| `update` | `def update(i: Int, v: T): Unit` | 同 |
| Ordering 实例 | `implicit val x: Ordering[T] = ...` | `given x: Ordering[T] = ...` |

## 演示

- v2: `Vec2` 加减乘 + 一元负 + apply/update + `Money` 自定义 Ordering
- v3: 同上 + `transparent inline def toMoney(...)` 编译期包装

## 命名规则

- 操作符只能以 `+ - * / : ? ~ ^ | & < > = !` 等符号开头
- 中缀方法只能有单个参数
- 一元方法名必须以 `unary_` 开头
- `apply` 可重载多次
- `update` 必须有返回类型 `Unit` 或与 setter 语义匹配

## 何时用什么

- 操作符用于领域 DSL(如 `1 day + 2 hours`)
- 不要滥用操作符;只在领域术语本身就使用该符号时重载
- 自定义 `Ordering` 用于排序,优先用 `Ordering.by` 派生
