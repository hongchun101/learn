# M02 函数

## 演示特性

- 默认参数 `def f(x: Int, y: Int = 10)`
- 命名参数 `f(y = 5, x = 1)`
- 变参 `def sum(xs: Int*)`
- 柯里化 `def f(x: Int)(y: Int)`
- 偏应用 `val f: Int => Int = curried(5)`
- 按名参数 `def f(block: => Unit)`
- 多参数列表 + using 链
- 过程语法(Scala 2 有,Scala 3 移除)
- `end <name>` 显式结束标记

## Scala 2 vs Scala 3 关键差异

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| 隐式参数 | `(implicit ev: T)` | `(using ev: T)` |
| 过程语法 | `def f(x: Int) { ... }` 返回 Unit(已不推荐) | 移除,必须 `def f(x: Int): Unit = ...` |
| if 块结束 | 必须用大括号 | 可选 `end if` |
| `then` 关键字 | 仅 when 与若干 | 几乎所有 if/while 都可用 |

## 演示文件

- `modules-v2/.../02_functions/v2/Functions.scala`
- `modules-v3/.../02_functions/v3/Functions.scala`

## 测试

- `FunctionsSpec` 覆盖默认参数、命名参数、变参、柯里化、按名参数、`using`、`end if`、控制抽象 when 等
