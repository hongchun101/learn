# M13 并发

## 演示特性

- `Future[A]` 异步计算
- `ExecutionContext` 决定线程模型(`using` / `implicit` 参数)
- for 推导串异步操作
- `recover` / `recoverWith` 失败恢复
- 并行集合 `par`(Scala 2.13+)
- 自定义 `ExecutionContext`(`Executors.newFixedThreadPool`)

## Scala 2 vs Scala 3

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| `Future` | 完整 API | 同 |
| ExecutionContext | `implicit ec: ExecutionContext` | `using ec: ExecutionContext` |
| `Await.result` | 完整 | 同 |
| 并行集合 | `par` | 同 |

## 演示

- v2: `addAsync` 异步加法 + `combine` traverse + `safeDivide` recover
- v3: 同 + using 风格

## ExecutionContext 给定方式

- Scala 2: `implicit val ec: ExecutionContext = ...`,`import X._` 后自动可见
- Scala 3: `given ec: ExecutionContext = ...`,需要 `import X.given` 才能用

## 最佳实践

- 不要在 EC 内部执行阻塞 I/O(用 `Future { blocking { ... } }`)
- 大量并发任务用 `Future.traverse` 而非 `for` 串行
- 测试中可注入受控 EC,避免 sleep
