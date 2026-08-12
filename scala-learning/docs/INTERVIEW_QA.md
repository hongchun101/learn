# Scala 专家级面试题 60 道

> 目标:对标一线城市 ¥50K+ Scala 岗位的面试深度。
> 涵盖:基础语法、类型系统、函数式编程、并发、生态、性能、库设计。

## 一、基础语法(1-10)

### Q1:解释 `val`、`var`、`def`、`lazy val` 的区别。

**答**:
- `val x = 1`:声明时立即求值,不可变
- `var x = 1`:声明时立即求值,可变
- `def x: Int = 1`:每次访问重新求值(无副作用时编译器可能记忆化)
- `lazy val x: Int = 1`:首次访问时求值,缓存结果,线程安全(DCL)

**实战**:默认 `val`;只在性能敏感时 `var`;循环或递归参数用 `def`;昂贵初始化的全局资源用 `lazy val`(但 cats-effect 的 `Resource` 更好)。

### Q2:解释 `class User(val name: String)` 中的 `val` 的作用。

**答**:`val` 让 `name` 成为类的**公开字段**。
- `class User(name: String)` —— `name` 是私有构造参数
- `class User(val name: String)` —— `name` 是公开字段
- `class User(var name: String)` —— `name` 是公开可变字段
- `class User(private val name: String)` —— `name` 是私有字段

### Q3:解释 `case class` 自动获得哪些能力。

**答**:
1. `apply` 工厂方法(可省略 `new`)
2. `equals` / `hashCode`(基于字段)
3. `toString`(`User(ada, 36)`)
4. `copy(name = "bob")` 浅复制
5. **模式匹配支持**
6. 字段默认是 `val`

### Q4:`sealed trait` 与普通 `trait` 的差异。

**答**:
- `sealed` 限制子类必须在**同一文件**内定义
- 编译器知道所有子类型 → match 时可做**穷尽性检查**
- Scala 2:漏 case 警告;Scala 3:漏 case **错误**
- 普通 trait 子类可散布各文件,编译器无法检查

### Q5:解释 `Nothing` 与 `Null` 的语义与使用。

**答**:
- `Nothing` 是所有类型的子类(`Nothing <: T` 对任何 T)
- 用途:`def fail(msg: String): Nothing = throw ...`(让类型推断收敛)
- `Null` 是所有引用类型的子类(`Null <: AnyRef`)
- 用途:**实际只用 `null` 一个值**,生产中应避免用,改用 `Option` / `Either`

### Q6:解释 `Any`、`AnyVal`、`AnyRef` 的关系。

**答**:
- `Any` 是所有类型的根
- `AnyVal` 是值类型父类(Int, Long, Boolean, Unit, ...)→ JVM 原始类型
- `AnyRef` 是引用类型父类 → `java.lang.Object`
- 模式匹配任何类型:`x: Matchable` 是 Scala 3 的新约束

### Q7:解释字符串插值 `s""`、`f""`、`raw""` 的区别。

**答**:
- `s"hi $name"` —— 简单插值
- `f"age=$age%04d"` —— 格式化(printf 风格)
- `raw"a\nb"` —— 不转义,保留 `\n` 原样
- 还可以自定义:在 `StringContext` 上加方法

### Q8:`def f(x: Int): Int = x + 1` 中 `= x + 1` 能否省略?

**答**:**Scala 2** 允许"过程语法" `def f(x: Int) { x + 1 }`(返回 Unit)。
**Scala 3** 移除该语法,必须写 `def f(x: Int): Unit = { x + 1 }`。

### Q9:`for { x <- xs; y <- ys } yield (x, y)` 翻译为什么?

**答**:`xs.flatMap { x => ys.map { y => (x, y) } }`。
守卫 `if cond` 翻译为 `withFilter`。

### Q10:解释 `xs match { case Nil => ...; case head :: tail => ... }` 的工作原理。

**答**:
- `Nil` 与 `::(head, tail)` 是 `List` 的两个 case class
- 模式匹配用 `unapply` 解构
- `head :: tail` 是中缀写法,等价于 `case ::(head, tail) =>`
- 编译器按 case 顺序匹配

## 二、面向对象(11-15)

### Q11:解释特质线性化(trait linearization)。

**答**:Scala 把多重继承扁平化为一个线性顺序,确定 `super` 调用方向。
规则:
- 保留每个特质最后一次出现
- 反转继承列表
- 去掉已出现的类型之前的位置

```scala
trait A; trait B extends A
class C extends B with A
// 线性化:C -> A -> B -> AnyRef -> Any
```

### Q12:`self: T =>` 自身类型的用途。

**答**:
- 约束:混入此 trait 的类必须**也混入** `T`
- 不需要继承(避免"必须先继承"的开销)
- 实战:`trait Persistable { self: Container => ... }`,混入时编译器强制

### Q13:抽象类 vs 特质,何时用哪个。

**答**:
| 场景 | 用 |
|------|-----|
| Java 互操作 | abstract class |
| 多继承 | trait |
| 主构造器参数 | class(更简洁) |
| 类型类 | trait |
| 状态机 | sealed trait + case class |
| 默认 final | open class(Scala 3) |

经验法则:**默认 trait**。

### Q14:解释 `open class`(Scala 3)。

**答**:Scala 3 默认所有类是 `final`(不可继承)。
要允许继承,显式 `open class`。
目的:防止无意中继承,允许编译器优化(单态化)。

### Q15:`object` 与 `class` 的差异。

**答**:
- `object`:单例,延迟初始化,线程安全
- `class`:多实例
- companion:同名 `class` + `object` 互为 companion,共享私有访问
- 用作命名空间:把工具方法、隐式实例、类型类放在 `object`

## 三、类型系统(16-25)

### Q16:`List[+A]` 中的 `+` 是什么意思?

**答**:**协变**。`List[Cat] <: List[Animal]`。
**注意**:协变类型只能"产出" A,不能"消费" A。
否则:`val animals: List[Animal] = List[Cat](); animals.add(Dog())` 会污染。

### Q17:为什么 `class List[+A] { def prepend(b: A): List[A] }` 编译错误?

**答**:协变类不能有"以 A 为参数"的方法(否则破坏子类型)。
修复:`def prepend[B >: A](b: B): List[B]`,让输入是 A 的父类。

### Q18:`Function1[-A, +B]` 为何输入逆变、输出协变?

**答**:
- 函数可被"特化"使用:`Cat => String` 可用于 `Animal => String` 上下文(逆变)
- 函数的输出可被"放大":返回 `Cat` 的函数返回 `Animal` 也正确(协变)

### Q19:解释类型 lambda。

**答**:组合两个高阶类型 `F[_]` 和 `G[_]` → `F[G[_]]`。
- Scala 2:需要 kind-projector 插件 `({type L[a] = F[G[a]]})#L`
- Scala 3:原生 `[A] =>> F[G[A]]`

实战:Monad Transformer `OptionT[F[_], A] = F[Option[A]]`。

### Q20:路径依赖类型举例。

**答**:
```scala
class Database { class Row }
val db1 = new Database; val db2 = new Database
val r1: db1.Row = db1.Row
// val r2: db2.Row = r1  // 编译失败
```
实战:数据库连接池区分"Slick 的会话"。

### Q21:解释 `enum`(Scala 3)。

**答**:比 `sealed trait + case object` 更紧凑的枚举。
```scala
enum Color:
  case Red, Green, Blue

enum Planet(mass: Double, radius: Double):
  case Mercury extends Planet(...)
```
可带字段、定义方法、泛型。

### Q22:`def f(using ev: Show[A]): String` 与 `def f(implicit ev: Show[A]): String` 的关系。

**答**:等价。Scala 3 把 `implicit` 拆为 `using`(参数列表) + `given`(值定义)。
- `(using ev: T)` ≡ `(implicit ev: T)`
- `given x: T = ...` ≡ `implicit val x: T = ...`

### Q23:`summon[T]` 与 `implicitly[T]` 的关系。

**答**:等价。`summon` 是 Scala 3 的更名,语义更清晰。

### Q24:解释 `inline def`(Scala 3)。

**答**:
- 把方法体在调用点**展开**(编译期)
- `inline` 参数必须是字面量
- 用途:消除虚调用、零成本抽象、宏

### Q25:解释 `transparent inline` 与 `inline` 的差异。

**答**:
- `inline` 展开后,返回类型由方法签名决定
- `transparent inline` 展开后,返回类型由内部分支决定
- 实战:`defaultValue[T]` 返回 T 的"零值",但返回类型是 T 而不是 Object

## 四、类型类(26-35)

### Q26:类型类的三件套。

**答**:
1. 类型类定义:`trait Show[A] { def show(a: A): String }`
2. 实例:`given Show[Int] = _.toString`
3. 接口:`def show[A: Show](a: A): String = summon[Show[A]].show(a)`

### Q27:类型类与 OOP trait 的差异。

**答**:
- OOP trait:必须混入,已有类型(Int、String)无法加
- 类型类:给任何类型加 given 实例,无需修改原类型
- OOP trait:静态检查 + virtual dispatch
- 类型类:静态检查 + 值传递(可优化)

### Q28:`summonFrom` 的用法。

**答**:`summonFrom` 在多个候选中按模式分派:
```scala
inline def render[T]: String = summonFrom {
  case ev: Show[Int]    => "int"
  case ev: Show[String] => "string"
  case _                => "other"
}
```

### Q29:解释 Functor 两条法律。

**答**:
1. 同一律:`fa.map(identity) == fa`
2. 复合律:`fa.map(f).map(g) == fa.map(f andThen g)`

法律由用户保证,编译器无法检查(用 cats-laws 测试)。

### Q30:解释 Monad 三条法律。

**答**:
1. 左单位:`pure(a).flatMap(f) == f(a)`
2. 右单位:`fa.flatMap(pure) == fa`
3. 结合性:`fa.flatMap(f).flatMap(g) == fa.flatMap(a => f(a).flatMap(g))`

### Q31:`Either` 与 `Validated` 的使用差异。

**答**:
- `Either`:flatMap 短路,第一个 Left 立即返回
- `Validated`(cats):mapN 累加,所有错误一起返回
- **业务流水线**用 `Either`
- **表单验证**用 `Validated`

### Q32:`Functor`、`Applicative`、`Monad` 的层次。

**答**:
- `Functor`:有 `map`
- `Applicative`:有 `map` + `pure` + `ap`(并行组合)
- `Monad`:有 `map` + `pure` + `flatMap`(顺序链式)
- `Monad` ⊂ `Applicative` ⊂ `Functor`

### Q33:`State` Monad 的工作原理。

**答**:`State[S, A] = S => (S, A)`,状态显式作为"值"传递。
`flatMap` 时,先跑一个,拿到新 state,再跑下一个。
实战:计算器、解析器。

### Q34:`Reader` Monad 是什么。

**答**:`Reader[R, A] = R => A`,环境作为"上下文"传递。
相当于函数式版的依赖注入。测试时注入 mock config。

### Q35:`traverse` 的工作原理。

**答**:`def traverse[F[_]: Applicative, A, B](fa: F[A])(f: A => F[B]): F[F[B]]`
- 把 F[G[A]] 翻成 G[F[A]]
- 实战:`List[Either[E, A]]` → `Either[E, List[A]]`
- 实战:`List[Option[A]]` → `Option[List[A]]`

## 五、并发(36-45)

### Q36:Future 的 5 个问题。

**答**:
1. 不可控执行(创建时立即跑)
2. 不可取消
3. 参照不透明(不知道在哪个线程)
4. 错误不强制处理
5. 阻塞(`Await.result`)

### Q37:`IO` 与 `Future` 的本质差异。

**答**:
- `Future` 是"已启动的计算"
- `IO` 是"计算的描述,未启动"
- `IO` 可取消、可控、参照透明、结构化并发

### Q38:`Resource` 的作用。

**答**:自动管理 acquire / release 配对。
- `Resource.make(acquire)(release)` —— 即使 use 中抛错,release 也会调用
- 实战:文件、连接、线程池

### Q39:`Ref` 与 `AtomicReference` 的差异。

**答**:
- `AtomicReference`:JVM 工具,在 blocking 代码中安全
- `Ref[IO]`:cats-effect 的并发原语,与 IO 集成,内部用 CAS
- 实战:共享状态(计数器、配置)

### Q40:解释结构化并发。

**答**:子任务的生命周期严格嵌套在父任务中。子任务不能比父任务"活得更久"。
- 父任务结束 → 所有子任务取消
- 父任务失败 → 子任务传播
- 资源不会泄漏

`Resource` + `IO.background` + `parTraverse` + `race` 实现结构化并发。

### Q41:`Deferred` 是什么。

**答**:一次性 promise。`Deferred[IO, A]` 只能 `complete` 一次,`get` 阻塞到完成。
实战:发布-订阅,事件通知。

### Q42:`Queue` 的并发模型。

**答**:无锁队列(cats-effect std),支持 unbounded / bounded。
`Queue.unbounded[IO, A]` 或 `Queue.bounded(n)`.
`offer` / `take` 都是 O(1) 均摊。

### Q43:`Semaphore` 是什么。

**答**:计数信号量。`Semaphore(n)` 有 n 个许可。
`permit.use(_ => someOp)` —— 自动获取/释放。

### Q44:`Promise` vs `Deferred`。

**答**:
- `Promise[A]`(Scala 标准库):与 Future 配套
- `Deferred[IO, A]`(cats-effect):与 IO 配套
- 后者是"IO 化"的版本,可取消

### Q45:`parTraverse` 与 `traverse` 的差异。

**答**:
- `traverse`:串行
- `parTraverse`:并行(用 cats-effect 调度)

```scala
xs.traverse(f)  // f 一个个跑
xs.parTraverse(f) // f 并行跑
```

## 六、性能与生态(46-55)

### Q46:`@specialized` 解决什么问题。

**答**:boxing(装箱)代价。
`List[Int]` 内部存 `java.lang.Integer`,每次 `head` 拆箱。
`@specialized(Int, Long)` 让编译器为 Int、Long 生成特化版本,直接用原始类型。

### Q47:解释 `@tailrec`。

**答**:
- 强制编译器检查"真是尾递归"
- 如果是,编译为 while 循环,栈安全
- 如果不是,**编译错误**

### Q48:`Vector` 与 `List` 的性能差异。

**答**:
- `List`:头 O(1),append O(n)(单链表)
- `Vector`:头 O(log32 n),append O(log32 n)(32-way 树)
- 大数据集合默认用 `Vector`

### Q49:解释 `LazyList` 的求值模型。

**答**:`LazyList` 是**懒**的。`head` 强制求值,`tail` 不强制。
多个引用共享已计算部分。
不适合做队列(头/尾不是 O(1))。

### Q50:解释 cats 与 cats-effect 的关系。

**答**:
- `cats`:纯类型类库(Functor、Monad、Traverse),无运行时
- `cats-effect`:在 cats 之上提供 `IO`、运行时调度、并发原语

### Q51:解释 `IOApp.Simple`。

**答**:`extends IOApp.Simple` 是 cats-effect 提供的入口点。
- 编译器生成 `main` 调用 `run`
- 内部用 `unsafeRunSync` 触发 IO
- 自动处理 `Runtime`、`ComputePool` 等

### Q52:`parMapN` 的含义。

**答**:
```scala
(a: IO[A], b: IO[B]).parMapN((a, b) => ...)
```
并行执行 a 与 b,等待两者完成,合并结果。等价于 for 中的并行分支。

### Q53:`Ref` 的 `updateAndGet` vs `getAndUpdate`。

**答**:
- `updateAndGet(f)`:先 update,后返回新值
- `getAndUpdate(f)`:先返回旧值,后 update
- 类比 Java `AtomicInteger` 的同名方法

### Q54:`Eval` 的 trampoline 是什么。

**答**:`Eval` 是 cats 提供的"栈安全"递归容器。
- `Eval.now`、`Eval.defer`、`Eval.always`
- 内部用 trampoline 把递归调用展平,避免栈溢出
- 实战:替代未优化的尾递归

### Q55:解释 `Algebraic Effects` 与 IO 的关系。

**答**:
- IO 是一种"代数效应"的具体实现
- 描述一段"可能产生副作用"的计算
- 与 Haskell 的 `IO` 类似,但 Scala 3 不在语言层支持代数效应
- 未来 Scala 4 可能有

## 七、库设计与最佳实践(56-60)

### Q56:写一个"类型安全的事件总线"。

**答**:
```scala
trait EventBus[E]:
  def subscribe(f: E => Unit): Unit
  def publish(e: E): Unit

class UserEventBus extends EventBus[UserEvent]:
  // 强类型,只接受 UserEvent
```
每个事件类型有独立 Bus,编译器保证不串。

### Q57:用类型系统表达"业务状态机"。

**答**:
```scala
sealed trait OrderState
object OrderState:
  sealed trait Pending extends OrderState
  sealed trait Confirmed extends OrderState
  sealed trait Shipped extends OrderState

class Order[+S <: OrderState]:
  def confirm(using s: S =:= OrderState.Pending): Order[OrderState.Confirmed] = ???
  def ship(using s: S =:= OrderState.Confirmed): Order[OrderState.Shipped] = ???

// 只能 confirm Pending,不能 confirm Confirmed
```

### Q58:什么时候用 implicit conversion 是不好的。

**答**:**永远不要用**(生产代码):
- 让代码"难读且难调试"
- 影响编译性能
- Scala 3 的 `given Conversion` 也尽量避免
- **优先用 extension method**

### Q59:解释 `Phantom Type`(幻类型)。

**答**:类型参数不出现在字段或方法签名中,只用于"编译期约束"。

```scala
sealed trait Locked
sealed trait Unlocked

class Door[S]:
  def open(using ev: S =:= Unlocked): Unit = ???
```

S 不出现在字段中,但被 `=:=` 约束,让 `open` 只能在 Unlocked 状态调用。

### Q60:解释 `final class` 与 `open class` 的取舍。

**答**:
- `final class`(Scala 3 默认):防止继承,允许单态化
- `open class`:可继承,失去单态化
- **库设计**:公共 API 用 `open` 或 `sealed trait`
- **实现细节**:用 `final`(默认)

## 八、答案速查

| 主题 | 关键词 |
|------|--------|
| 类型系统 | 协变 +A / 逆变 -A / 不变 A |
| 协变限制 | 不能"消费" A |
| 函数类型 | Function1[-A, +B] |
| 类型类 | trait + given + using |
| 隐式解析 | 局部 → 隐式作用域 → 显式 import |
| Functor 律 | identity / composition |
| Monad 律 | left / right / associativity |
| 路径依赖 | outer#Inner vs path.Inner |
| 类型 lambda | Scala 3 `[A] =>> F[G[A]]` |
| Future 痛点 | 不可控、不可取消、参照不透明 |
| IO 优势 | 描述性、可取消、参照透明 |
| 资源管理 | Resource.make |
| 结构化并发 | 子任务生命周期受父任务约束 |
| Scala 3 改进 | enum / given / using / extension / inline / Matchable |
| 类型级证明 | =:= / <:< / Phantom Type |

## 九、面试建议

1. **先讲语义,再讲语法** —— 解释"为什么"比"是什么"重要
2. **画图** —— 类型层级、Monad 流程、状态机都画出来
3. **承认边界** —— 不知道就说不知道
4. **实战经验** —— 准备 1-2 个"我做过"的真实项目
5. **愿意学** —— Scala 生态在变,持续学习比死记重要

## 十、检查清单

- [ ] 60 道题都能 30 秒内回答
- [ ] 能画图解释类型层级、Monad 流程
- [ ] 准备 1-2 个真实项目深入讲解
- [ ] 解释 5 个 Scala 3 相比 Scala 2 的改进
- [ ] 解释 cats 与 cats-effect 的差异
- [ ] 解释 IO 与 Future 的 5 个差异
- [ ] 解释"什么时候用类型类"vs"什么时候用 OOP"
