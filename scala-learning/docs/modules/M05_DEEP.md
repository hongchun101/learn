# M05 类型类深度

> Phase 2 核心模块。类型类是 Scala 函数式编程的支柱。
> 学完这章,你可以为任何项目写出"以类型为中心"的 API。

## 1. 为什么需要类型类

OOP 风格的扩展能力:
```scala
// 假设我们要给所有类型加"打印"能力
trait Printable:
  def print: String

class User extends Printable:
  def print: String = s"User..."

// 问题:不能给 Int、String 等已有类型加 Printable
// 也不能给第三方库的类型加
```

类型类的解决方案:**把"能力"定义为接口,把"实现"作为独立数据**。

```scala
trait Show[A]:
  def show(a: A): String

object Show:
  given Show[Int]    = _.toString
  given Show[String] = s => s"\"$s\""
  given [A: Show] as Show[List[A]] = _.map(_.show)

def show[A: Show](a: A): String = summon[Show[A]].show(a)

show(42)       // "42"
show("hi")     // "\"hi\""
show(List(1))  // "[\"1\"]"
```

**为什么这更好?**
1. **开放封闭**:不需要改 `Show`,只要加新实例
2. **可派生**:有 `Show[A]` 就能派生 `Show[List[A]]`
3. **可组合**:`Show[Either[A, B]]`、`Show[Option[A]]` 都能用 `given` 自动派生
4. **类型安全**:编译器检查 `Show[A]` 是否存在,不存在时给出有意义的错误

## 2. 三件套

类型类的标准结构:

```scala
// 1) 类型类定义
trait Show[A]:
  def show(a: A): String

// 2) 实例
object Show:
  given Show[Int]    = _.toString
  given Show[String] = s => s"\"$s\""

// 3) 接口(可选)
def show[A: Show](a: A): String = summon[Show[A]].show(a)
```

`[A: Show]` 是**上下文约束**的语法糖,等价于 `(using ev: Show[A])`。

## 3. 类型类法律 (Laws)

类型类**不是接口契约**——它隐含地约定了"法律"。

### Functor 法律

```scala
trait Functor[F[_]]:
  extension [A](fa: F[A]) def map[B](f: A => B): F[B]
```

法律:
- **同一性**:`fa.map(identity) == fa`
- **复合性**:`fa.map(f).map(g) == fa.map(f andThen g)`

### Monad 法律

```scala
trait Monad[F[_]] extends Functor[F]:
  def pure[A](a: A): F[A]
  extension [A](fa: F[A])
    def flatMap[B](f: A => F[B]): F[B]
```

法律:
- **左单位**:`pure(a).flatMap(f) == f(a)`
- **右单位**:`fa.flatMap(pure) == fa`
- **结合性**:`fa.flatMap(f).flatMap(g) == fa.flatMap(a => f(a).flatMap(g))`

**为什么法律重要?**
- 法律保证用户可以"用直觉"操作类型类
- 编译器无法检查法律,只能靠测试(`cats-laws` 库提供法律测试)
- 违反法律的实例会导致"在某个角落崩,但重构时才发现"的 bug

## 4. 派生 (Derivation)

为复合类型自动派生类型类:

```scala
// 半自动派生
trait Show[A]:
  def show(a: A): String

object Show:
  given Show[Int] = _.toString
  given Show[String] = s => s"\"$s\""

  // List[A] 的派生
  given [A: Show] as Show[List[A]] = xs =>
    xs.map(_.show).mkString("[", ",", "]")

  // Either[L, R] 的派生
  given [L: Show, R: Show] as Show[Either[L, R]] = _ match
    case Left(l)  => s"Left(${l.show})"
    case Right(r) => s"Right(${r.show})"
```

Scala 3 的 `given ... as ...` 语法(在 Scala 2 中要用 `implicit def as`)让派生更清晰。

**实战技巧**:
- **半自动**:每个复合类型写一个 `given`(可控)
- **自动**:用 Magnolia、Shapeless 3 / Scala 3 macros(零样板)
- **Scala 3.3 的 `inline given`**:对 sealed trait 子类型自动派生

```scala
// Scala 3.3 inline derivation
import scala.deriving.Mirror
import scala.compiletime.*

inline def summonInstance[T](using m: Mirror.SumOf[T]): String =
  inline m match
    case s: Mirror.SumOf[T] =>
      // 遍历所有 case
      ...
```

## 5. summonFrom:多层分派

当一个类型有多个候选实例,需要"分情况拉取":

```scala
trait Json[A]
object Json:
  given Json[Int]    = ???
  given Json[String] = ???
  given [A: Json] as Json[List[A]] = ???

def render[A](a: A)(using j: Json[A]): String = j match
  case _: Json[Int]    => "got int"
  case _: Json[String] => "got string"
```

或者用 `summonFrom`(Scala 3):
```scala
inline def renderType[A]: String = summonFrom {
  case _: Json[Int]    => "int"
  case _: Json[String] => "string"
  case _               => "other"
}
```

## 6. 隐式转换 (Given Conversion)

Scala 2:
```scala
implicit def intToDouble(i: Int): Double = i.toDouble
val d: Double = 42  // 自动转
```

Scala 3:
```scala
given Conversion[Int, Double] = _.toDouble
val d: Double = 42  // 自动转
```

**生产建议**:**避免 implicit conversion**。它们让代码变得"难读且难调试"。
优先用 `extension` 或显式 `.toDouble`。

## 7. 类型类 vs OOP 子类

| 场景 | 类型类 | OOP 子类 |
|------|--------|----------|
| 给已有类型加能力 | ✅ 加 given | ❌ 不能改 Int |
| 给第三方类型加能力 | ✅ 加 given | ❌ 不能改 String |
| 同一类型多行为 | ✅ 多个 given | ✅ 多 trait |
| 法律检查 | ✅ 文档 + 测试 | ⚠️ 文档 |
| 学习曲线 | 较陡 | 平缓 |
| 性能 | 同 | 同 |

**实战结论**:**默认用类型类**,OOP 子类只用于"业务上的 IS-A"。

## 8. 实战:写一个简单的 Json 类型类

```scala
// 1) 类型类
trait JsonCodec[A]:
  def encode(a: A): String
  def decode(s: String): Either[String, A]

// 2) 基础实例
object JsonCodec:
  given JsonCodec[Int] = new JsonCodec[Int]:
    def encode(a: Int): String = a.toString
    def decode(s: String): Either[String, Int] =
      scala.util.Try(s.toInt).toEither.left.map(_.getMessage)

  given JsonCodec[String] = new JsonCodec[String]:
    def encode(a: String): String = s"\"$a\""
    def decode(s: String): Either[String, String] =
      if s.startsWith("\"") && s.endsWith("\"") then Right(s.drop(1).dropRight(1))
      else Left(s"not a json string: $s")

  // 派生 List
  given [A: JsonCodec] as JsonCodec[List[A]] = new JsonCodec[List[A]]:
    def encode(xs: List[A]): String =
      xs.map(_.encode).mkString("[", ",", "]")
    def decode(s: String): Either[String, List[A]] =
      if s.startsWith("[") && s.endsWith("]") then
        val inner = s.drop(1).dropRight(1)
        if inner.isEmpty then Right(Nil)
        else inner.split(",").toList.traverse(_.decode)
      else Left(s"not a json array: $s")

  // 3) 接口
  def encode[A: JsonCodec](a: A): String = summon[JsonCodec[A]].encode(a)
  def decode[A: JsonCodec](s: String): Either[String, A] = summon[JsonCodec[A]].decode(s)
```

**注意**:上面用了 `traverse`,它需要 `Monad` 证据。生产中会用 cats 库提供。

## 9. 派生库对比

| 库 | 风格 | 适用 |
|-----|------|------|
| 手写 | 显式 given | 学习 / 小项目 |
| Magnolia | Scala 3 macro,极简 | 生产 |
| Shapeless 2/3 | 通用 | Scala 2 时代主流 |
| Scala 3 `inline given` | 语言级 | 简单 ADT |
| circe / upickle | 半自动 + generic | JSON 序列化 |

**推荐**:
- **学习**阶段:手写 given
- **生产**:用 circe 之类成熟库,或 Magnolia 半自动派生

## 10. 检查清单

- [ ] 写出完整的类型类三件套
- [ ] 解释 Functor 的两条法律
- [ ] 解释 Monad 的三条法律
- [ ] 用 `given [A: ...] as ...` 派生 List[A] 的类型类
- [ ] 解释 `summonFrom` 的用法
- [ ] 区分类型类与 OOP trait
- [ ] 解释为什么不推荐 implicit conversion
