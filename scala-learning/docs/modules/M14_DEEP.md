# M14 内联与宏深度

> Phase 2 高级模块。Scala 3 的 inline 与 macros 是它的"超能力"。

## 1. inline:编译期展开

`inline def` 把方法体直接替换到调用点。

```scala
inline def twice(inline n: Int): Int = n * 2

val r = twice(21)
// 编译器展开为: val r = 21 * 2
// 字节码里没有 twice 方法
```

**强制约束**:
- `inline` 参数必须是**字面量**或已知常量的值
- 不强制,就没法展开

```scala
def compute(n: Int): Int = twice(n)  // ❌ n 不是字面量
```

## 2. transparent inline:返回精确类型

`transparent inline` 让 inline 函数的**返回类型**取决于参数。

```scala
transparent inline def defaultValue[T]: T =
  inline erasedValue[T] match
    case _: Int     => 0
    case _: Long    => 0L
    case _: String  => ""
    case _: Boolean => false

val i: Int     = defaultValue[Int]      // 0
val s: String  = defaultValue[String]   // ""
// 编译器在调用点选择正确的分支
```

**实战**:
- 写"零成本"的默认值
- 写"零成本"的多态分发
- 实现类型类派生

## 3. compiletime.*

```scala
import scala.compiletime.*

// constValue:把字面量类型转为值
inline def constOf[N]: N = constValue[N]
constOf[42]  // 42

// error:编译期抛错
inline def assertPositive(inline n: Int): Unit =
  if n <= 0 then error("expected positive")
  else ()

// erasedValue:在 inline 中按类型分支
inline def size[T <: Tuple]: Int =
  inline erasedValue[T] match
    case _: EmptyTuple      => 0
    case _: (h *: t)         => 1 + size[t]

// summonFrom:从多个候选中选
inline def render[T](using o: Ordering[T]): String =
  summonFrom {
    case ord: Ordering[Int]    => "int"
    case _: Ordering[String]  => "string"
    case _                    => "other"
  }
```

## 4. 实战:编译期 JSON 解析

```scala
import scala.compiletime.{constValue, summonFrom, error}

case class Config(host: String, port: Int)

inline def getConfig[K <: String]: Any =
  inline constValue[K] match
    case "host" => "0.0.0.0"
    case "port" => 8080
    case _      => error(s"unknown key")

val host: String = getConfig["host"]  // 编译期已确定
```

## 5. Scala 3 Macros

Scala 3 引入**真正的宏系统**:`inline def` + `scala.quoted`。

```scala
import scala.quoted.*

inline def debug(inline expr: Any): Any = ${ debugImpl('expr) }

private def debugImpl(expr: Expr[Any])(using Quotes): Expr[Any] =
  import quotes.reflect.*
  '{ println("evaluating: " + ${Expr(expr.show)}) ; $expr }
```

**`quotes.reflect` 提供**:
- `Tree` —— 编译期 AST
- `TypeRepr` —— 类型表示
- `Symbol` —— 符号(类、方法、字段)
- `Term`、`Apply`、`Select` 等

**实战**:
- 自动派生 JSON 编解码(circe、upickle)
- 自动派生类型类
- 编译期断言
- DSL 编译器

## 6. 实战:一个简单的类型类派生

```scala
import scala.deriving.Mirror
import scala.compiletime.*

trait JsonEncoder[A]:
  def encode(a: A): String

object JsonEncoder:
  given JsonEncoder[Int] = _.toString
  given JsonEncoder[String] = s => s"\"$s\""

  // 自动派生 ADT
  inline given [A](using m: Mirror.ProductOf[A]): JsonEncoder[A] =
    new JsonEncoder[A]:
      def encode(a: A): String =
        val fields = a.asInstanceOf[Product].productIterator.toList
        val encs = summonAll[Tuple.Map[m.MirroredElemTypes, JsonEncoder]]
        val parts = fields.zip(encs).map { (f, e) => e.asInstanceOf[JsonEncoder[Any]].encode(f) }
        s"{${parts.mkString(",")}}"

  // ... summonAll 实现
```

`Mirror.ProductOf[A]` 是 Scala 3 给所有 case class 提供的反射元数据。

## 7. 派生库对比

| 库 | 风格 | 何时用 |
|-----|------|--------|
| 手写 | 给每个 ADT 写 given | 学习 |
| `inline given` + `Mirror` | 半自动 | 简单 ADT |
| Magnolia | 成熟,广泛 | 生产推荐 |
| circe-generic | 完全自动(反射) | JSON 序列化 |
| Shapeless 2 | 旧,Scala 2 时代主流 | 老项目维护 |
| Shapeless 3 | Scala 3 化 | 高级应用 |

**推荐**:
- **学习**:手写
- **生产**:用成熟库(circe、upickle、magnolia)

## 8. 何时用宏

**用**:
- 写**库**需要派生(circe、doobie、tapir)
- 写**DSL**需要编译期验证
- 写**类型类**派生
- 优化热路径(消除虚调用)

**不用**:
- 业务代码(99% 的情况不需要)
- 团队不熟悉时(写出来别人看不懂)
- 编译时间敏感的 CI

## 9. 编译时间成本

宏会让编译变慢:
- inline 展开:每次调用都展开,可能 1000 倍代码膨胀
- 派生宏:每个类型都要遍历字段
- 反射:运行时找不到编译期信息

**控制**:
- 用 `private[macro]` 限定作用域
- 把派生结果缓存
- 减少 macro 嵌套

## 10. 检查清单

- [ ] 解释 `inline` 与 `transparent inline` 的差异
- [ ] 写出 `constValue`、`erasedValue`、`summonFrom` 的用法
- [ ] 解释 Scala 3 `quoted` 模块的 API
- [ ] 用 `Mirror.ProductOf` 写一个简单的类型类派生
- [ ] 解释为什么"99% 业务代码不需要宏"
- [ ] 解释宏的编译时间成本
