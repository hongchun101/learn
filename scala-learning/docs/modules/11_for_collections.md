# M11 for 推导与集合

## 演示特性

- for-yield 本质是 `map`/`flatMap`/`withFilter` 的语法糖
- 守卫 `if cond` 翻译为 `withFilter`
- 模式绑定 `pattern <- expr` 翻译为 `flatMap { case pattern => ... }`
- 可用于任何实现 `map`/`flatMap`/`withFilter` 的类型
- `Stream`(Scala 2) → `LazyList`(Scala 3)

## Scala 2 vs Scala 3

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| for 语法 | `for { x <- xs; if cond } yield ...` | 兼容 + `if cond then` 风格可选 |
| 懒序列 | `Stream`(deprecated) | `LazyList` |
| 自定义 for-capable | 实现 `map`/`flatMap`/`withFilter` | 同 |

## 演示

- v2: `Stream` 求前 10 个平方;`Either` for 串行除法;`Wrap` 自定义 for-capable
- v3: 同 + `Option` for 求和;`LazyList` 替代 `Stream`

## 何时用 for-yield vs 直接调用 HOF

- 单步 `map`/`filter` 直接调用,更显式
- 多个生成器、守卫、模式解构时用 for-yield,可读性更好
- 性能上无差异(for 编译后等价)
