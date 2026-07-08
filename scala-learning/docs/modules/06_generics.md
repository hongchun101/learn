# M06 泛型、型变与高阶类型

## 演示特性

- 型变 `+A`(协变) / `-A`(逆变) / `A`(不变)
- 上界 `A <: B` / 下界 `A >: B`
- 高阶类型 `F[_]`
- 类型 lambda:`[F[_]] =>> F[G[A]]`(Scala 3 原生) / `({type L[a] = F[G[a]]})#L`(Scala 2)
- 抽象类型 `type T`
- 上下文约束 `[T: TypeClass]`

## Scala 2 vs Scala 3

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| 类型 lambda | 需要 kind-projector 插件 | 原生 `[F[_]] =>> ...` |
| 函数返回类型 | `T =:= U` 约束 | 同样,还有 `Matchable` 约束 |
| HKT 实例语法 | `implicit val x: Functor[List] = ...` | `given x: Functor[List] with ...` |

## 关键演示

- v2: 协变 `List[+A]` + Functor + Compose
- v3: 同上,`Composed[F[_], G[_]] = [A] =>> F[G[A]]` 原生类型 lambda

## Functor + Functor 组合

```scala
// Scala 3
def compose[F[_], G[_], A, B](fga: F[G[A]])(f: A => B)(
  using F: Functor[F], G: Functor[G]
): F[G[B]] =
  F.map(fga)(ga => G.map(ga)(f))
```

## 何时用协变/逆变

- 容器(`List`, `Option`) 几乎都用 `+A` 协变
- 函数输入参数用 `-A`(因为函数类型 `Function1[-A, +B]`)
- 如果类型既作为输入又作为输出,不要用 `+`/`-`(改用不变)
