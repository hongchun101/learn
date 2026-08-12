# M11 for 推导深度

> Phase 1 核心模块。for 推导是 Scala 表达力的另一半来源。

## 1. for 的本质

for 推导是 `map` / `flatMap` / `withFilter` 的语法糖。

```scala
for
  x <- xs
  y <- ys
  if x + y > 0
yield (x, y)

// 翻译为:
xs.flatMap { x =>
  ys.withFilter { y => x + y > 0 }.map { y =>
    (x, y)
  }
}
```

**关键点**:
- 第一个生成器用 `flatMap`
- 后续生成器用 `flatMap`(嵌套)
- 守卫用 `withFilter`
- `yield` 翻译为 `map`

## 2. for-capable 类型

只要有 `map` + `flatMap`(可选 `withFilter`),for 就能用。

**标准库**:
- `List`、`Vector`、`Set`、`Map`、`LazyList`(都是 Iterable)
- `Option`
- `Either`
- `Try`(Scala 2.13+)
- `Future`

**自定义**:
```scala
case class Wrap[A](value: A):
  def map[B](f: A => B): Wrap[B] = Wrap(f(value))
  def flatMap[B](f: A => Wrap[B]): Wrap[B] = f(value)

val r: Wrap[Int] = for
  a <- Wrap(10)
  b <- Wrap(20)
yield a + b
// r.value == 30
```

## 3. 模式在 for 中

```scala
for
  Some(x) <- List(Some(1), None, Some(3))
yield x * 2
// List(2, 6)

// 等价
List(Some(1), None, Some(3)).flatMap {
  case Some(x) => Some(x * 2)
  case None    => None  // wrap 你的返回类型
}
```

**陷阱**:模式 fail 时(for-yield 内部),返回**空**集合(不是抛错)。

## 4. for 推导与副作用

```scala
// 不用 yield,只做副作用
for
  user <- users
  _    <- sendEmail(user)  // sendEmail 应该有签名 () => F[Unit]
yield ()
```

**实战**:
- `for { _ <- xs; ... } yield ()` 等价于 `xs.foreach(...)`
- 但 `for { _ <- xs; ... }` 模式更整齐

## 5. for 推导在 monad 栈中

```scala
// Either:第一个 Left 短路
for
  u <- loadUser(id)        // Either[E, User]
  p <- loadPrefs(u.id)     // Either[E, Prefs]
yield (u, p)

// Future:每个 step 异步
for
  u <- fetchUser(id)       // Future[User]
  p <- fetchPrefs(u.id)    // Future[Prefs]
yield (u, p)

// 混合 Future[Either] 与 for
for
  u <- fetchUser(id)        // Future[Either[E, User]]
  p <- fetchPrefs(u.id)     // 取出 Either 后再 fetch
  if p.isRight
yield p
```

**注意**:混合 monad 容易踩坑(嵌套 for)。生产中用 cats 的 `EitherT[F[_], E, A]` 来扁平。

## 6. 复杂生成器:依赖

```scala
for
  user <- users              // Future[User]
  prefs <- fetchPrefs(user.id)  // 依赖 user.id
yield (user, prefs)
```

这是 `flatMap` 的真正威力:**动态决定下一步**。

## 7. 生成器 vs 守卫的位置

```scala
for
  x <- xs                    // 生成器:提供元素
  if x > 0                   // 守卫:过滤
  y <- (1 to x)              // 动态生成器(依赖 x)
yield (x, y)
```

**实战技巧**:
- 守卫放在依赖它的生成器**之后**
- 守卫翻译为 `withFilter`(lazy)
- 多个守卫可连用

## 8. for 推导 vs 直接 flatMap

```scala
// 直接
xs.flatMap { x =>
  ys.map { y =>
    (x, y)
  }
}

// for
for
  x <- xs
  y <- ys
yield (x, y)
```

**何时用 for**:
- 多步、多生成器、多守卫、模式解构
- 可读性优先

**何时用 flatMap/map**:
- 单步、链短
- 性能不是差异(for 编译后等价)

## 9. desugaring 详解

```scala
for
  a <- genA
  b <- genB(a)        // 依赖 a
  if cond(b)
  c <- genC(b)        // 依赖 b
yield transform(b, c)

// 翻译:
genA.flatMap { a =>
  genB(a).withFilter(cond).flatMap { b =>
    genC(b).map { c =>
      transform(b, c)
    }
  }
}
```

**关键**:
- 每个生成器都嵌套在前一个的 flatMap 中
- 守卫在该生成器后面立即用 withFilter
- yield 是最内层的 map

## 10. for-yield 与 lazy evaluation

```scala
val xs: LazyList[Int] = LazyList.from(1)
val ys = for
  x <- xs
  if x % 2 == 0
yield x * x

ys.take(3).toList  // List(4, 16, 36),只计算 3 个
```

**`for` 不改变求值模型**。LazyList 仍懒,List 仍严格。

## 11. 实战:ETL 流水线

```scala
def loadFile(path: String): Either[AppError, List[String]] = ???
def parseLine(line: String): Either[ParseError, RawOrder] = ???
def validate(order: RawOrder): Either[ValidationError, Order] = ???
def save(order: Order): IO[Unit] = ???

def pipeline(path: String): IO[Either[AppError, Unit]] = for
  lines  <- IO.fromEither(loadFile(path))
  parsed <- lines.traverse(parseLine)  // 收集所有错误 vs 短路
  valid  <- parsed.traverse(validate)
  _      <- valid.traverse_(save)
yield Right(())

// 注意:用 traverse 而不是 for,因为 for 短路
```

## 12. for 在 Option 中的细节

```scala
for
  a <- Some(1)        // Option[Int]
  b <- Some("hi")     // Option[String]
  c <- None           // Option[Nothing] - 短路!
yield s"$a-$b-$c"
// None
```

第一个 None 让整个 for 短路为 None。这是为什么在 Scala 中"用 Option 表达可能失败"很地道。

## 13. 检查清单

- [ ] 翻译一段 for 为 map/flatMap
- [ ] 写一个 for-capable 自定义类型
- [ ] 解释 for 中模式 fail 的处理
- [ ] 解释 for-yield 与副作用的写法
- [ ] 在 Either / Future / Option 上写多步 for
- [ ] 解释为什么 for 与 flatMap 性能等价
- [ ] 用 for + traverse 写 ETL
