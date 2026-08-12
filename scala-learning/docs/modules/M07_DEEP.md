# M07 模式匹配深度

> Phase 1 核心模块。模式匹配是 Scala 表达力的一半来源。

## 1. 模式匹配的种类

```scala
// 字面量
case 42 => ...

// 通配符
case _ => ...

// 变量绑定(小写)
case x => ...

// 类型模式
case s: String => ...

// 构造器
case Some(x) => ...
case Cons(h, t) => ...

// 元组
case (a, b) => ...

// 序列
case List(1, 2, _*) => ...

// 中缀
case head :: tail => ...

// 替代
case 1 | 2 | 3 => ...

// 守卫
case x if x > 0 => ...

// 命名绑定
case xs @ List(_, _) => ...

// 反引号强制变量
case `name` => ...
```

## 2. 提取器 (Extractor)

任何有 `unapply` 或 `unapplySeq` 的对象都是提取器。

```scala
object Email:
  def unapply(s: String): Option[(String, String)] =
    s.split("@") match
      case Array(user, domain) if domain.contains(".") => Some((user, domain))
      case _ => None

val s = "ada@example.com"
s match
  case Email(user, domain) => println(s"$user @ $domain")
  case _                  => println("not an email")
```

**Boolean 提取器**(Scala 3):
```scala
object Even:
  def unapply(n: Int): Boolean = n % 2 == 0

n match
  case Even() => "even"
  case _      => "odd"
```

## 3. unapplySeq

```scala
object Split:
  def unapplySeq(s: String): Option[List[String]] = Some(s.split(",").toList)

"a,b,c,d" match
  case Split(a, b, rest @ _*) => (a, b, rest.toList)
  // a = "a", b = "b", rest = List("c", "d")
```

## 4. 正则表达式作为提取器

```scala
import scala.util.matching.Regex

val DatePattern: Regex = """(\d{4})-(\d{2})-(\d{2})""".r

"2024-03-15" match
  case DatePattern(y, m, d) => s"$y-$m-$d"
  case _ => "not a date"
```

## 5. 命名绑定 (@)

```scala
case xs @ List(1, _*) =>
  println(s"head 1, rest has ${xs.length - 1} elements")
```

绑定允许**同时**匹配结构并保留整体引用。

## 6. 类型擦除的限制

```scala
def f(xs: List[Any]): String = xs match
  case ls: List[String] => "strings"   // 编译警告
  case li: List[Int]    => "ints"      // 编译警告
  // 运行时类型信息被擦除,List[String] 和 List[Int] 都是 List
```

**绕过**:`ClassTag`:
```scala
import scala.reflect.ClassTag

def f[T: ClassTag](xs: List[T]): String =
  summon[ClassTag[T]] match
    case _: ClassTag[String] => "strings"
    case _: ClassTag[Int]    => "ints"
    case _                   => "other"
```

## 7. 变量绑定的细节

Scala 2 中:
- `case Foo` 大写 → 视为常量
- `case foo` 小写 → 视为变量

Scala 3 中:
- 全部 `val` 都是 stable identifier,作为常量
- 反引号强制变量:`case `Foo``

```scala
val Zero = 0
val zero = 0

x match
  case Zero => "got 0"     // Scala 2:常量;Scala 3:常量(因为 Zero 是 val)
  case zero => "got zero"   // 都是变量绑定
  case `Zero` => "binding"  // Scala 3 反引号:变量绑定
```

## 8. match 的 return 类型

match 是个**表达式**。必须有返回类型。

```scala
def f(x: Int): String = x match
  case 0 => "zero"
  case _ => "other"

// 无 match 时的"兜底"模式
def f(x: Int): String = x match
  case n if n > 0 => "positive"
  case 0          => "zero"
  case n          => "negative ($n)"  // 编译器知道 n <= -1
```

## 9. 模式匹配的内部表示

Scala 编译器把 match 编译为:
- **小型 match**(2-3 case):跳转表
- **大型 match**:决策树
- **巨大型**:线性扫描

优化时机由编译器决定。新版 Scala 编译器(`-Ypatmat-exhaustiveness`)更激进。

## 10. 实战:解析器组合子

```scala
sealed trait Token
case class Ident(name: String) extends Token
case class Number(n: Int)      extends Token
case class Op(op: String)      extends Token
case object LParen             extends Token
case object RParen             extends Token

def parseExpr(tokens: List[Token]): (Expr, List[Token]) = tokens match
  case Number(n) :: rest =>
    (Lit(n), rest)
  case Ident(name) :: Op("+") :: rest =>
    val (right, rest2) = parseExpr(rest)
    (Add(Var(name), right), rest2)
  case LParen :: rest =>
    val (e, rest2) = parseExpr(rest)
    rest2 match
      case RParen :: more => (e, more)
      case _              => sys.error("expected )")
  case _ => sys.error(s"unexpected: $tokens")
```

## 11. 模式匹配 vs 字段访问

```scala
// 模式匹配:解构 + 控制流
user match
  case User("admin", _, _) => grantAccess()
  case User(_, _, age) if age >= 18 => adultAccess()
  case _ => denyAccess()

// 字段访问:数据访问
val name = user.name
val age  = user.age
```

**经验法则**:
- 模式匹配解构 + 分支 → match
- 字段访问 → 直接 `.field`

## 12. for-推导中的模式

```scala
for
  Some(x) <- xs
  Right(y) <- ys
yield x + y

// 等价
xs.flatMap {
  case Some(x) => ys.map {
    case Right(y) => x + y
    case _ => ???
  }
  case _ => Nil
}
```

**实战**:
- 配合 Option、Either,完美过滤 None / Left
- 配合 sealed trait,模式等价于"switch"

## 13. 检查清单

- [ ] 解释 unapply / unapplySeq 的差异
- [ ] 写一个布尔提取器
- [ ] 解释 Scala 2 与 Scala 3 中大小写常量规则的差异
- [ ] 用正则作为提取器解析日期
- [ ] 解释命名绑定的用途
- [ ] 解释 for-推导中模式的工作原理
- [ ] 用 match 写一个小型解析器
