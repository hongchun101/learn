# M00 表达力之旅 —— 30 分钟理解 Scala 的核心价值

> **目标读者**:听说过 Scala,想知道"为什么我要学这个"。
> 时长:30 分钟。
> 不写任何代码也可以,但最好打开 sbt console 跟着敲。

## 一、Scala 是什么

Scala 是一门**运行在 JVM 上、静态类型、同时支持面向对象与函数式编程**的语言。
它出现在 2004 年,2023 年发布 Scala 3.3。当前生产环境两大版本并行:Scala 2.13 与 Scala 3.3。

Scala 的设计哲学:**用类型表达约束,用表达式组合计算,用不变性降低复杂度**。

下面用 6 个例子让你感受这种哲学。

## 二、例子 1:用类型代替 if/else

Java 写法:
```java
public String getStatus(int code) {
    if (code == 200) return "OK";
    if (code == 404) return "NotFound";
    return "Unknown";
}
```

Scala 写法:
```scala
sealed trait Status
case object Ok                  extends Status
case object NotFound            extends Status
case class  Unknown(code: Int)  extends Status

def getStatus(code: Int): Status = code match
  case 200 => Ok
  case 404 => NotFound
  case n   => Unknown(n)
```

**收益**:编译器知道你处理了所有情况。如果你加了一个 `case object Forbidden`,编译器会**报错**(Scala 3)或**警告**(Scala 2),而不是运行时崩。

## 三、例子 2:Option 代替 null

Java 写法:
```java
public String findUserEmail(long id) {
    User u = db.findById(id); // 可能是 null
    if (u != null) {
        if (u.getEmail() != null) {
            return u.getEmail();
        }
    }
    return "anonymous";
}
```

Scala 写法:
```scala
def findUserEmail(id: Long): String =
  db.findById(id).flatMap(_.email).getOrElse("anonymous")
```

或者用 for:
```scala
def findUserEmail(id: Long): String =
  for
    u    <- db.findById(id)
    mail <- u.email
  yield mail
  // 没有兜底,直接抛;要兜底再加 .getOrElse
```

**收益**:类型签名告诉你"可能不存在",编译器强制你处理 None。

## 四、例子 3:模式匹配代替 instanceof + cast

Java 写法:
```java
public double area(Shape s) {
    if (s instanceof Circle c)    return Math.PI * c.radius() * c.radius();
    if (s instanceof Rectangle r) return r.width() * r.height();
    throw new IllegalStateException("unknown shape");
}
```

Scala 写法:
```scala
def area(s: Shape): Double = s match
  case Circle(r)    => math.Pi * r * r
  case Rectangle(w, h) => w * h
```

Scala 3 中**漏掉任何一个 case 直接编译失败**。

## 五、例子 4:扩展方法代替工具类

Java 写法:
```java
public class StringUtils {
    public static String toSnake(String s) { ... }
}
// 调用:StringUtils.toSnake("UserName")
```

Scala 写法:
```scala
extension (s: String)
  def toSnake: String = ...

"UserName".toSnake   // 像 String 自带的方法
```

**收益**:代码可读性飙升,且不破坏 String 类的封装。

## 六、例子 5:类型类代替 if/instanceof

"这个集合里的元素怎么打印"在 Java 里要写一堆 if-instanceof。
Scala 用类型类:

```scala
trait Show[A] { def show(a: A): String }
given Show[Int]    = _.toString
given Show[String] = s => s"\"$s\""
def show[A: Show](a: A): String = summon[Show[A]].show(a)
```

调用方写 `show(42)` 或 `show("hi")`,编译器自动选对实例。

**收益**:开放封闭原则——给新类型加 `Show` 实例,不用改 `show` 方法。

## 七、例子 6:并发副作用管理

Java 写异步:
```java
CompletableFuture<User> f1 = userApi.fetch(id);
CompletableFuture<Order> f2 = orderApi.fetch(id);
CompletableFuture.allOf(f1, f2)
    .thenApply(v -> new Bundle(f1.join(), f2.join()));
```

Scala 3 + cats-effect 写:
```scala
def bundle(id: Long): IO[Bundle] =
  (userApi.fetch(id), orderApi.fetch(id)).parMapN(Bundle.apply)
```

`parMapN` 含义清晰:**并行等待两个 IO,然后用结果合成 Bundle**。
如果 `userApi.fetch` 失败,`bundle` 失败,不需要 join 也不需要异常处理样板。

## 八、Scala 的代价

凡事都有代价。Scala 的代价是:

- **编译慢**——scalac 的 typer 阶段是瓶颈
- **学习曲线陡**——类型类、宏、HKT 不是 3 天能消化的
- **生态分裂**——Scala 2 与 3 不完全兼容
- **新人写出"非地道"代码**——任何语言都有这问题,Scala 特别严重

但如果你**在乎类型安全、并发安全、表达力**,Scala 是当前最值得投入的语言之一。

## 九、接下来怎么走

读 [LEARNING_ROADMAP.md](../LEARNING_ROADMAP.md) 的 Phase 1。

第一周目标:

1. 装好 sbt + JDK 11
2. 把本仓库 `git clone` 下来
3. 跑 `sbt +Test/test`
4. 读 [01_basics.md](01_basics.md)
5. 在 sbt console 里把每个例子敲一遍

加油。
