# Scala 2 vs Scala 3 差异速查表

> 对应项目代码中 `modules-v2/` 与 `modules-v3/` 两个子项目。
> 所有 16 个模块都在两个版本下并排实现,可逐行对照。

## 一、语法层面的变化

| 概念 | Scala 2.13 | Scala 3.3+ |
|------|------------|------------|
| 隐式值 | `implicit val` | `given ... = ...` |
| 隐式参数 | `(implicit ev: T)` | `(using ev: T)` |
| 隐式解析 | `implicitly[T]` | `summon[T]` |
| 上下文绑定 | `[T: Foo]` | `[T: Foo]` (不变) |
| 隐式转换 | `implicit def` | `given Conversion[A, B]` |
| 扩展方法 | `implicit class` | `extension` 顶级关键字 |
| 包级共享 | `package object` | 顶级定义 + `export` |
| 枚举 | `object X extends Enumeration` | `enum X:` |
| 过程语法 | `def f() { ... }` | 已移除(必须 `def f(): Unit = ...`) |
| if/while 块 | 必须括号 | `if cond then` + 可选 `end if` |
| 类型 lambda | `({type L[a] = F[G[a]]})#L`(需 kind-projector) | `[F[_]] =>> F[G[A]]` 原生 |
| 值类 | `class X(val v: T) extends AnyVal` | `opaque type X = T` + companion |
| 元编程 | macro + quasiquote(需 macro paradise) | `inline` / `transparent inline` / `compiletime.*` |
| 大小写常量 | `case UPPER` 视为常量,`case lower` 视为变量绑定 | `case Zero` 都按 stable 模式 |
| match 穷尽性 | 警告 | **错误** |
| for 推导 | `for { x <- xs; if cond } yield ...` | 兼容;支持 `if cond then` |
| 控制结构 end 标记 | 无 | `end if` / `end for` / `end match` 可选 |

## 二、模式匹配的关键差异

```scala
// Scala 2
val Zero = 0
x match {
  case Zero => ...        // 稳定标识符,匹配值 0
  case n: Int => ...      // 类型模式
}

// Scala 3
val Zero = 0
x match
  case Zero => ...         // 与 Scala 2 相同(稳定 val)
  case n: Int => ...
```

Scala 3 中**移除**了"大写 = 常量、小写 = 变量"的隐式规则——所有 `val` 都是 stable identifier。要在模式中作为变量绑定(无视大小写),用反引号:

```scala
val Foo = 0
x match
  case `Foo` => ...   // 强制变量绑定,名字为 Foo
```

## 三、类型类

### Scala 2

```scala
trait Show[A] { def show(a: A): String }
implicit val intShow: Show[Int] = (a: Int) => a.toString
def show[A](a: A)(implicit ev: Show[A]): String = ev.show(a)
```

### Scala 3

```scala
trait Show[A]:
  def show(a: A): String

given intShow: Show[Int] = (a: Int) => a.toString
def show[A](a: A)(using ev: Show[A]): String = ev.show(a)

// 给定项 import
import TypeClasses.given  // 引入所有 given
```

## 四、扩展方法

### Scala 2 (implicit class 模式)

```scala
object StringOps:
  implicit class Rich(val s: String) extends AnyVal:
    def toSnake: String = ...

// 调用方
import StringOps._
"FooBar".toSnake
```

### Scala 3 (extension 关键字)

```scala
extension (s: String)
  def toSnake: String = ...

"FooBar".toSnake  // 自动可见,无需 import
```

## 五、ADT 与枚举

### Scala 2

```scala
sealed trait Color
case object Red extends Color
case object Green extends Color

object ColorEnum extends Enumeration {
  val Red, Green, Blue = Value
}
```

### Scala 3

```scala
enum Color:
  case Red, Green, Blue

// 带参数
enum Json:
  case JNull
  case JStr(s: String)
  case JArr(items: List[Json])
```

## 六、元编程

### Scala 2 (传统宏)

```scala
// 需要 scala-reflect + macro paradise 插件
// def myMacro(x: Int): Int = macro myMacroImpl
// def myMacroImpl(c: Context)(x: c.Expr[Int]): c.Expr[Int] = ...
```

### Scala 3 (内联 + 编译期 API)

```scala
import scala.compiletime.{constValue, error, summonFrom}

transparent inline def twice(inline n: Int): Int = n * 2

inline def assertPositive(inline n: Int): Unit =
  if n <= 0 then error("expected positive")
  else ()
```

## 七、迁移要点

1. **隐式** → 全部替换为 `given`/`using`(可用 `-source:future` 渐进式)
2. **`implicit class`** → `extension`(语法更简洁,无 AnyVal 限制)
3. **`package object`** → 顶级定义 + `export`
4. **`Enumeration`** → `enum`
5. **`macro`** → `inline` + `compiletime.*`
6. **`Stream`** → `LazyList`
7. **大小写常量规则变化** — 检查模式匹配
8. **过程语法** — 改为 `def f(): Unit = ...`
9. **`Any` 在 Scala 3 中分裂**为 `Matchable` 和 `Serializable` 子类

## 八、跨版本编译策略

本项目结构:
- `modules-v2/` 子项目用 Scala 2.13.12 编译
- `modules-v3/` 子项目用 Scala 3.3.3 编译
- 两者均使用 ScalaTest 3.2.17 做单元测试

```bash
sbt "modulesV2/Test/compile"
sbt "modulesV3/Test/compile"
sbt "modulesV2/Test/test"
sbt "modulesV3/Test/test"
# 跨版本批量
sbt +Test/compile
sbt +Test/test
```

ScalaTest 3.2.17 同时支持 Scala 2.13 与 Scala 3,无需两套测试库。
