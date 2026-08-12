# 第 02 章 Scala 函数式编程

> Spark/Flink 主语言是 Scala,Kafka 客户端大量 Scala 内部接口。即使你写 PySpark,看 RDD/Dataset API 源码、读源码 PR 也绕不开它。

---

## 一、为什么 Scala 是大数据基因语言

```
    Java                Scala                 Spark/Flink
  -------->   补函数式   ------->   用更少代码表达转换逻辑
  强类型              强类型 + 类型推断          RDD/Dataset
  面向对象            面向对象 + 函数式           DataFrame API
```

Scala 让 Spark RDD 的算子(map/flatMap/reduceByKey)设计成天然链式 + 惰性求值。如果用 Java 写同样逻辑,样板代码量 ×3-5 倍。

---

## 二、Scala 2.13 vs 3.x 速览

| 特性 | 2.13 | 3.x | 影响 |
|------|------|-----|------|
| 集合库 | 已重写,标准库精简 | 沿用 | 性能更好,源码更短 |
| 隐式转换 | `implicit` 关键字 | `given` / `using` | 3.x 更明确 |
| 宏 | experimental | 稳定 | 编译期元编程 |
| 枚举 | sealed trait 模拟 | `enum` 原生 | 模式匹配友好 |
| 扩展方法 | implicit class | `extension` 关键字 | 3.x 更直观 |
| 严格性 | 较宽松 | 更严格,弃用更彻底 | 迁移有 breaking change |

**生产建议**:新项目直接 3.x;Spark 3.3+ 已支持 Scala 2.13,Flink 1.15+ 部分支持 Scala 3。**不要混用 2.12/2.13/3.x** 于一个集群,ABI 不兼容。

---

## 三、协变与逆变

```scala
class Animal
class Dog extends Animal
class Cat extends Animal

// 协变:Producer[+T], 子类型关系沿类型参数正向传递
trait Producer[+T] {
  def produce(): T
}
val dogProducer: Producer[Dog] = ???
val animalProducer: Producer[Animal] = dogProducer   // OK, Dog <: Animal

// 逆变:Consumer[-T], 子类型关系反向传递
trait Consumer[-T] {
  def consume(t: T): Unit
}
val animalConsumer: Consumer[Animal] = ???
val dogConsumer: Consumer[Dog] = animalConsumer       // OK, 消费 Animal 也可消费 Dog
```

**记忆口诀**:Producer 协变(只产出 T,T 更具体 → 容器也更具体);Consumer 逆变(只消费 T,能消费 Animal 一定能消费 Dog → 反向)。

**Spark 中应用**:`RDD[Dog]` 是 `RDD[Animal]` 的子类型,这就是协变;`Function1[Animal, Unit]` 能赋给 `Function1[Dog, Unit]`(处理动物的方式一定能处理狗)即逆变。

---

## 四、隐式转换(Implicit)—— Spark 的粘合剂

### 4.1 隐式转换示例

```scala
// 旧式 (Scala 2)
implicit class StringOps(s: String) {
  def toIntSafe: Option[Int] = Try(s.toInt).toOption
}
"42".toIntSafe   // Some(42)

// Scala 3 写法
extension (s: String)
  def toIntSafe: Option[Int] = Try(s.toInt).toOption
```

### 4.2 Spark 中的隐式王国

```scala
// DataFrame 的 DSL 语法全是隐式转换撑起来的
import spark.implicits._
df.where($"age" > 18).select($"name")    // $"age" 由 StringToColumnConverter 提供
```

**核心规则**:
1. 隐式值必须在作用域(`import` 或同文件 `implicit val`)
2. 同类型隐式只能有一个,编译器二选一直接报错
3. 隐式转换链不能超过编译器规定深度(避免爆炸)

### 4.3 生产陷阱

```scala
// 场景:多个 implicit 引起编译歧义,CI 突然挂
implicit val a: Encoder[User] = Encoders.product[User]
implicit val b: Encoder[User] = Encoders.javaObject  // 编译失败
// 修复:只保留一个,或放不同 import 域
```

---

## 五、模式匹配

```scala
sealed trait Event
case class Click(userId: String, ts: Long) extends Event
case class Purchase(userId: String, amount: Double) extends Event
case object Timeout extends Event

def handle(e: Event): String = e match {
  case Click(uid, ts) if ts > 0       => s"click $uid"
  case Purchase(uid, amt) if amt > 0  => s"buy $uid"
  case Timeout                        => "timeout"
  case _                              => "unknown"
}
```

| 模式 | 用途 |
|------|------|
| 常量模式 | 匹配 `case 1 =>` |
| 类型模式 | `case x: List[Int] =>` |
| 构造器模式 | 解构 `case Foo(a, b) =>` |
| 序列模式 | `case List(0, _, _) =>` |
| 守卫模式 | `if 条件` |
| 变量绑定 | `case x @ Foo(_) =>` |

**编译器保护**:如果 `Event` 是 `sealed`,所有子类型未覆盖时编译器警告,杜绝漏 case。

---

## 六、函数式核心:Option / Either / Try

```scala
def lookupUser(id: String): Option[User] = cache.get(id)
def charge(u: User, amt: Double): Either[String, Receipt] =
  if (amt > u.balance) Left("insufficient")
  else Right(process(u, amt))

// 链式
val result: Either[String, Receipt] =
  lookupUser(id)
    .toRight("user not found")
    .flatMap(u => charge(u, amount))
```

| 类型 | 表达 | 何时用 |
|------|------|--------|
| `Option[T]` | 有/无 | 找不到值 |
| `Either[L, R]` | 错/对,带错误信息 | 业务错误可恢复 |
| `Try[T]` | 异常/值 | 包裹可能抛异常的副作用 |
| `Future[T]` | 异步结果 | IO/CPU 密集任务 |

**反模式**:`.get` / `.head` 直接取值,生产里这是 NPE/IndexOutOfBounds 头号来源。永远先 map/flatMap。

---

## 七、集合库性能(2.13+ 重写后)

```scala
List(1,2,3,4,5)
  .filter(_ % 2 == 0)   // 遍历 List 一次
  .map(_ * 2)            // 再遍历,生成 Vector
  .to(List)              // 再转 List
```

### 7.1 集合选择矩阵

| 集合 | 查找 | 头尾增删 | 适用 |
|------|------|----------|------|
| List | O(n) | O(1) 头 | 顺序流、模式匹配递归 |
| Vector | O(log n) | O(log n) | 默认选择,大多数场景 |
| Array | O(1) | O(n) | 大数据原始类型,避免装箱 |
| HashMap | O(1) avg | O(1) avg | 通用 KV |
| Set | O(1) | O(1) | 去重/存在性 |

### 7.2 大数据特别注意

```scala
// 不要在 Spark Driver 收集大 List
val bigList: List[Row] = df.collect().toList   // OOM!
// 改用迭代器/写盘
df.write.parquet("/tmp/out")
```

---

## 八、Spark RDD 编程范式(用 Scala 表达)

```scala
val counts: RDD[(String, Int)] = sc.textFile("hdfs:///data/log/*")
  .flatMap(line => line.split("\\s+"))
  .filter(_.nonEmpty)
  .map(word => (word, 1))
  .reduceByKey(_ + _, numPartitions = 200)    // 提前 reduce,shuffle 数据量减半
  .persist(StorageLevel.MEMORY_AND_DISK_SER) // 序列化存,内存省 5x
```

**性能三原则**:
1. **能窄依赖就别 shuffle**:`map/filter/join(窄)` 比 `groupByKey/reduceByKey` 优先
2. **shuffle 前先聚合**:`reduceByKey` > `groupByKey` (前者本地预聚合)
3. **复用 RDD**:`persist` + `unpersist`,反复用到的 RDD 别每次重算

---

## 九、案例分析:Spark SQL UDF 编码器

```scala
// 不好的写法
spark.udf.register("len", (s: String) => s.length)
spark.sql("SELECT len(name) FROM users")  // 每行反射,慢

// 好的写法
import org.apache.spark.sql.functions.udf
val lenUdf = udf((s: String) => Option(s).map(_.length).getOrElse(0))
df.select(lenUdf(col("name")))
```

---

## 实战任务

1. **协变/逆变实验**:定义 `Box[+T]` 和 `Consumer[-T]`,写两个赋值示例,验证类型推导。
2. **隐式转换实现**:为 `Int` 加一个 `days` 扩展方法(返回 Duration),用 Scala 3 `extension` 写法重做。
3. **模式匹配穷尽**:定义 sealed trait `Cmd`,包含 5 个 case class,写处理函数,故意漏一个看编译器警告。
4. **集合性能**:用 JMH(Scala 用 `sbt-jmh`)测试 List vs Vector vs Array 100w 次 `head + tail`,记录差异。
5. **Spark reduceByKey 优化**:构造 1 亿条 `(word, 1)` 数据,对比 `reduceByKey` 与 `groupByKey` + `mapValues(_sum)` 的 shuffle 数据量和时长。
6. **Option 反模式修复**:找一段你以前写的 `.get` 代码,改成 `map/flatMap/getOrElse`。

---

## 专家面试题

1. **Scala 协变和逆变怎么记?在 Spark 里哪里用到?**
   要点:Producer 协变、Consumer 逆变(记忆口诀)。Spark 中 `RDD[+T]`、`Function1[-T1, +R]`、`Array[+T]` 都是协变/逆变实际应用。

2. **隐式转换的解析规则?**
   要点:作用域(局部 > 显式 import > 通配 import > 伴生对象/隐式作用域);唯一性(无歧义);可见性(不能是 private[this] 之外的内层)。编译器报 "ambiguous implicit values" 就是规则冲突。

3. **`sealed trait` 配合模式匹配有什么好处?**
   要点:封闭继承 + 编译器穷尽性检查,新增 case class 不更新 match 会编译警告,杜绝运行时 MatchError。

4. **`Option` 和 `Either` 怎么选?**
   要点:`Option` 只表示有无;`Either[L, R]` 携带错误信息。业务可恢复错误用 `Either`,单纯查不到用 `Option`。

5. **为什么 Spark 用 lazy val?它解决了什么问题?**
   要点:`lazy val` 延迟初始化 + 线程安全(Scala 编译器用双重检查锁)。Spark 用在 Singleton、SQL 解析器等"用时才创建,且只创建一次"的对象。

6. **Scala 3 比 2.13 主要改了什么?为什么还没全面铺开?**
   要点:语法更明确(`given`/`using`/`extension`),隐式更可控,无破坏性兼容保证;但生态(库/编译器插件)迁移慢,Spark 3.5+ 才默认 Scala 2.13,3.x 仍在过渡。

---

## 生产经验

- **版本锁定**:`build.sbt` 中 `scalaVersion := "2.13.12"` 必须钉死,不允许 `+` 或 `latest.release`。Scala 跨小版本都可能 ABI 不兼容。
- **小心 Java 集合隐式转换**:Scala 2.13 的 `scala.jdk.CollectionConverters._` 比 2.12 的 `JavaConverters` 更明确,但**混用方向不对会抛异常**(双向 vs 单向)。
- **`null` 在 Scala 里能不用就别用**:返回 `Option`,调用者被迫处理。如果一定要和 Java 互操作,用 `@nowarn` 或显式 `Option(...).orNull`。
- **隐式越多,编译越慢**:大项目里 Scala 编译时间常常是瓶颈。开启 `-Dscalac.options.optimise`,移除冗余 implicit。
- **Spark 算子重载陷阱**:`Dataset[T].join` 的隐式重载多达 10+ 个,选错一个编译报错但 IDE 提示模糊,熟悉最常用的 3 个签名能省 90% 调试时间。