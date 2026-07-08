# M15 高级类型

## 演示特性

- 路径依赖类型:不同实例的内部类互不兼容
- 类型 lambda:组合两个高阶类型
- 依赖方法类型:返回类型依赖具体实例
- 抽象类型成员 `type T`
- HKT 的实际应用:`Functor` 组合

## Scala 2 vs Scala 3

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| 类型 lambda | `({type L[a] = F[G[a]]})#L` | `[F[_]] =>> F[G[A]]` 原生 |
| 路径依赖 | 完整 | 完整,某些 match 场景更严格 |
| 依赖方法类型 | 完整 | 完整 |
| 匹配类型 | 不支持 | 计划中(Scala 3.3 仍需 -Y 标志) |

## 演示

- v2: `Database.Row` 路径依赖 + `Compose` 类型 lambda + `Length` 依赖方法
- v3: 同 + `Compose[F[_], G[_]] = [A] =>> F[G[A]]` 一等公民

## 何时用

- 路径依赖:区分不同上下文(数据库连接、表行)
- 类型 lambda:Monad Transformer 风格(F[G[A]])
- 依赖方法:库 API 中"类型随值变"的需求
- HKT 组合:库作者(cats / scalaz 风格)

## 注意事项

- 类型 lambda 在 Scala 2 中需要 kind-projector 插件
- Scala 3 中类型 lambda 是语言级特性,但 compose / map 仍需类型类(Functor)提供
