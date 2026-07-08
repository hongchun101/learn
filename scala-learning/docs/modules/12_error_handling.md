# M12 错误处理

## 演示特性

- `Try[A]`:`Success` / `Failure` 包装异常
- `Either[L, R]` 显式错误
- `scala.util.control.NonFatal` 区分致命与非致命异常
- `scala.util.control.Exception.catching` 包装 DSL
- for 推导在 `Try` / `Either` / `Option` 一致

## Scala 2 vs Scala 3

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| `Try` | 完整 API | 同 |
| `Either` | 完整 API | 同 |
| `NonFatal` | 完整 | 同 |
| `catching` DSL | 完整 | 同 |
| 自定义错误 | sealed trait + case class | enum |

## 演示

- v2: sealed trait `AppError` + case classes,`catching` DSL 包装 parseInt
- v3: enum `AppError` + 同样的处理流程

## 错误处理选型

- `Option`:可能缺失、不关心原因
- `Either` / `Try`:需要表达错误细节
- `Either` 倾向函数式(纯),`Try` 倾向包装副作用
- 抛异常:仅在不可恢复错误时(参数校验失败、I/O 协议错误等)

## 最佳实践

- 自定义错误 ADT 用 sealed trait / enum
- 不要用 `null` 表达错误
- 在边界处用 `Try` 捕获,内部用 `Either` 传递
