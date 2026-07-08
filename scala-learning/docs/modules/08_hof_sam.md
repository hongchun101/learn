# M08 高阶函数与 SAM

## 演示特性

- 函数类型 `(A1, ..., AN) => R`
- 函数可作为参数 / 返回值
- 自动 SAM(Single Abstract Method)转换
- 闭包捕获
- 偏应用函数 `_` 占位
- by-name 参数与 thunk 包装

## Scala 2 vs Scala 3

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| 函数类型 | `(Int) => Int` | 同 |
| SAM 自动转换 | 2.12+ | 保留 + 改进:lambda 保留精确类型 |
| by-name | `block: => Unit` | 同 |
| curry | 多参数列表 | 同 |

## 演示

- v2: 函数组合、foldLeft、SAM trait `Transformer`、闭包计数器
- v3: 同上 + `defer(by-name)` thunk 包装

## 何时用

- 高阶函数是 Scala 集合 API 的基础(`map`, `filter`, `flatMap` 全部是 HOF)
- SAM 让 Java 风格的 interface 与 Scala lambda 互通
- by-name 用于控制流抽象(when/unless 模式)
