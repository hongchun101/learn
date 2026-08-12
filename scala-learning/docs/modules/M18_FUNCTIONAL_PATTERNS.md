# M18 函数式模式

> Phase 2 核心模块。本章覆盖 FP 的核心抽象:Functor、Applicative、Monad、Traverse、Foldable、State。
> 学完这章,你可以阅读 cats / scalaz 的源码而不迷路。

## 1. Functor:可被 map 的东西

```scala
trait Functor[F[_]]:
  extension [A](fa: F[A])
    def map[B](f: A => B): F[B]
```

实例:`List`、`Option`、`Either[L, +*]`、`Future`、`Map[String, +*]`。

```scala
List(1, 2, 3).map(_ + 1)              // List(2, 3, 4)
Option(1).map(_ + 1)                  // Some(2)
Right(1).map(_ + 1)                   // Right(2)
```

**法律**:
- 同一律:`fa.map(identity) == fa`
- 复合律:`fa.map(f).map(g) == fa.map(f andThen g)`

**注意**:`Either[L, R]` 中 `L` 是**不变**的(`map` 不改变错误),只有 `R` 是 functor 维度。

## 2. Apply / Applicative:可"并行组合"的值

Applicative 是 Functor 的超集,加了"把多个 F[A] 组合成一个 F[(A, B, ...)]"的能力。

```scala
trait Apply[F[_]] extends Functor[F]:
  extension [A, B](fa: F[A])
    def ap(fab: F[A => B]): F[B]
    def product[B](fb: F[B]): F[(A, B)]  // 改名 tuple2

trait Applicative[F[_]] extends Apply[F]:
  def pure[A](a: A): F[A]
```

**与 Monad 的区别**:
- `ap` 需要**先有** `F[A => B]`,然后应用到 `F[A]`
- `flatMap` 在 `F[B]` **生成时**才决定

```scala
// 假设有 cats.syntax.apply.*
case class Config(host: String, port: Int)

def loadHost: F[String] = ???
def loadPort: F[Int]    = ???

// Applicative 风格:并行 / 独立
val config: F[Config] = (loadHost, loadPort).mapN(Config)

// Monad 风格:依赖
val config2: F[Config] = for
  h <- loadHost
  p <- loadPort
yield Config(h, p)
```

**何时用 Applicative**:
- 两个独立计算(并行、错误累加)
- 解析"有 N 个字段,每个都可能失败"的配置

**何时用 Monad**:
- 计算之间**有依赖**(一个的输出是另一个的输入)

## 3. Monad:可"链式 flatMap"的值

```scala
trait Monad[F[_]] extends Applicative[F]:
  extension [A](fa: F[A])
    def flatMap[B](f: A => F[B]): F[B]
```

**三种理解**:
1. **顺序计算**:`fa.flatMap(a => fb(a))` —— a 计算完再 fb
2. **效果叠加**:`Option` 的 flatMap = "如果上一段是 None,这里也是 None"
3. **do 记法**:`for { a <- fa; b <- fb } yield b` —— 像 Haskell 的 do

**法律**:
- 左单位:`pure(a).flatMap(f) == f(a)`
- 右单位:`fa.flatMap(pure) == fa`
- 结合性:`fa.flatMap(f).flatMap(g) == fa.flatMap(a => f(a).flatMap(g))`

## 4. Either 链 vs Validated

**Either**:
- `Left` 时立即 short-circuit(flatMap 短路)
- 适合**流水线**

**Validated** (cats 提供):
- `Invalid` 时**累加所有错误**
- 适合**表单验证**

```scala
// Either —— 短链
def signup(name: String, email: String): Either[Error, User] =
  for
    n <- checkName(name)       // 如果这一步失败,后续不执行
    e <- checkEmail(email)
yield User(n, e)

// Validated —— 累加
import cats.data.Validated
import cats.syntax.all.*

def signup(name: String, email: String): Validated[Errors, User] =
  (checkName(name), checkEmail(email)).mapN(User.apply)
  // 收集所有错误,一次性显示
```

**生产建议**:
- **业务逻辑**用 `Either`(有先后依赖)
- **表单/API 入口**用 `Validated`(希望一次性看到所有错误)
- 不要混用

## 5. Traverse:把 F[G[A]] 翻成 G[F[A]]

```scala
trait Traverse[G[_]]:
  extension [F[_]: Applicative, A](ga: G[F[A]])
    def traverse[B](f: A => F[B]): F[G[B]]
```

**实战场景**:

```scala
// List[Option[A]] → Option[List[A]]
List(Some(1), Some(2), Some(3)).traverse(identity)
// Some(List(1, 2, 3))

List(Some(1), None, Some(3)).traverse(identity)
// None  (短链)

// List[Either[E, A]] → Either[E, List[A]]
List(Right(1), Right(2), Right(3)).sequence
// Right(List(1, 2, 3))

List(Right(1), Left("err"), Right(3)).sequence
// Left("err")
```

**实现**(纯 Scala 3):
```scala
def traverse[F[_]: Applicative, A, B](xs: List[A])(f: A => F[B]): F[List[B]] =
  xs.foldRight(Applicative[F].pure(List.empty[B])) { (a, acc) =>
    (f(a), acc).mapN(_ :: _)
  }
```

## 6. Foldable:可"折叠"的东西

```scala
trait Foldable[F[_]]:
  extension [A](fa: F[A])
    def foldLeft[B](z: B)(f: (B, A) => B): B
    def foldRight[B](z: B)(f: (A, B) => B): B
    def foldMap[B: Monoid](f: A => B): B
    def reduceLeftOption[A](f: (A, A) => A): Option[A]
    def toList: List[A]
    def find(p: A => Boolean): Option[A]
    def exists(p: A => Boolean): Boolean
    def forall(p: A => Boolean): Boolean
```

**为什么 Foldable 重要?**
- `List`、`Vector`、`Option`、`Either`、`Map`、`Set` 都有 `Foldable` 实例
- 写通用代码"能折叠任何东西"

```scala
def sumAll[F[_]: Foldable, A: Numeric](fa: F[A]): A =
  fa.foldLeft(Numeric[A].zero)(Numeric[A].plus)

sumAll(List(1, 2, 3))         // 6
sumAll(Option(42))            // 42
sumAll(Map("a" -> 1, "b" -> 2))  // 3
```

## 7. State Monad:把"状态"显式化

```scala
case class State[S, A](run: S => (S, A))

object State:
  def apply[S, A](run: S => (S, A)): State[S, A] = new State(run)
  def pure[S, A](a: A): State[S, A] = State(s => (s, a))

// Monad 实例
given [S] => Monad[[A] =>> State[S, A]] with
  extension [A](sa: State[S, A])
    def flatMap[B](f: A => State[S, B]): State[S, B] = State { s0 =>
      val (s1, a) = sa.run(s0)
      f(a).run(s1)
    }
  def pure[A](a: A): State[S, A] = State.pure(s, a)
```

**实战**:
```scala
// 计算器:用 State 跟踪栈
type CalcState[A] = State[List[Double], A]

def push(x: Double): CalcState[Unit] = State(stack => (x :: stack, ()))
def add: CalcState[Double] = State {
  case a :: b :: rest => (rest, a + b)
  case s => sys.error(s"need 2 operands, got $s")
}

def program: CalcState[Double] = for
  _ <- push(1.0)
  _ <- push(2.0)
  _ <- push(3.0)
  r <- add
yield r

program.run(List.empty)._2  // 6.0
```

**优势**:
- 状态在**类型签名**里出现
- 易于测试:`program.run(initialState)._1 == finalState`
- 易于组合:多个 State 自然拼接

## 8. Reader Monad:把"环境"显式化

依赖注入的"纯函数式"版本。

```scala
case class Reader[R, A](run: R => A)

object Reader:
  def apply[R, A](run: R => A): Reader[R, A] = new Reader(run)
  given [R] => Monad[[A] =>> Reader[R, A]] with
    extension [A](ra: Reader[R, A])
      def flatMap[B](f: A => Reader[R, B]): Reader[R, B] =
        Reader(r => f(ra.run(r)).run(r))
    def pure[A](a: A): Reader[R, A] = Reader(_ => a)
```

**实战**:
```scala
trait AppConfig:
  def db: Database
  def logger: Logger

def getUser(id: Long): Reader[AppConfig, User] = Reader { cfg =>
  cfg.db.query(s"SELECT * FROM users WHERE id = $id")
}

def logOperation(name: String): Reader[AppConfig, Unit] = Reader { cfg =>
  cfg.logger.info(s"op: $name")
}

def program: Reader[AppConfig, User] = for
  _   <- logOperation("getUser")
  u   <- getUser(42)
yield u

program.run(myConfig)  // 注入具体 config
```

**生产价值**:
- 测试时注入 mock config
- 不需要 DI 容器(Spring)
- 类型签名告诉你"这个函数需要什么环境"

## 9. Writer Monad:把"日志"显式化

```scala
type Writer[L, A] = WriterT[Id, L, A]
// 等价: (L, A) 但 L 是 Monoid
```

把副作用(写日志)塞进值里。

**生产中很少用**,因为:
- log 顺序需要严格控制时,`IO` 更合适
- 业务日志用 `Logger` 直接打更清晰
- 在 cats-effect 时代,`IO` 是更好的"副作用容器"

## 10. MonadTransformer:在容器中再嵌容器

```scala
// OptionT[F[_], A] = F[Option[A]]
case class OptionT[F[_], A](value: F[Option[A]])

object OptionT:
  given [F[_]: Monad] => Monad[[A] =>> OptionT[F, A]] with ...
```

**何时用**:
- 你有一个 `F[Option[A]]`(比如 `IO[Option[A]]`),要在 Option 与 F 之间穿梭
- 例:`Future[Option[User]]` 的 for 推导
  ```scala
  // 没 OptionT,需要 nested for
  for
    opt <- futureOption
    a   <- opt   // 这一层 for 在 Option 上
  yield a

  // 有 OptionT,扁平
  val program: OptionT[Future, Int] = for
    a <- futureOptUser
    b <- futureOptOrder
  yield a + b
  ```

**何时不用**:
- 简单的 `for` 能搞定时,不要引入 transformer
- Transformer 性能略差(有外层容器分配)

## 11. 实战:用 cats 写一个服务层

```scala
import cats.*
import cats.data.*
import cats.effect.IO
import cats.syntax.all.*

trait UserRepo:
  def find(id: Long): IO[Option[User]]
  def save(user: User): IO[Unit]

case class UserService[F[_]: Monad](repo: UserRepo):
  def register(u: User): F[Either[String, User]] =
    for
      existing <- repo.find(u.id)
      result <- existing match
        case Some(_) => Monad[F].pure(Left("exists"))
        case None =>
          for _ <- repo.save(u)
          yield Right(u)
    yield result

// 调用
val service = UserService(myRepo)
service.register(newUser).flatMap {
  case Right(u) => IO.println(s"created $u")
  case Left(e)  => IO.println(s"error: $e")
}
```

## 12. 检查清单

- [ ] 解释 Functor / Applicative / Monad 的差异
- [ ] 写出 `traverse` 的实现
- [ ] 区分 `Either` 与 `Validated` 的使用场景
- [ ] 解释 `State` Monad 的工作原理
- [ ] 解释 `Reader` Monad 替代 DI 容器的价值
- [ ] 解释何时使用 MonadTransformer
- [ ] 写出 Monad 的 3 条法律
