# M13 并发基础深度

> Phase 1 核心模块。本章覆盖 Scala 2 的 Future;M19 深入 cats-effect。

## 1. Future 的本质

`Future[A]` 是 Scala 标准库的"已经启动的异步计算"。

```scala
import scala.concurrent.{Future, ExecutionContext}
import scala.concurrent.ExecutionContext.Implicits.global

val f: Future[Int] = Future {
  Thread.sleep(100)
  42
}
// 此时 f 已经在某个线程上开始计算了
```

**关键问题**:
- `Future` 一被创建就**立即**开始计算,无法延迟
- 无法取消已经启动的 Future
- 类型 `Future[Int]` 与 "42 那个 Int" 是**两回事**

## 2. ExecutionContext

`ExecutionContext` 是"Future 在哪个线程池跑"的描述。

```scala
import java.util.concurrent.Executors
import scala.concurrent.ExecutionContext

implicit val ec: ExecutionContext = ExecutionContext.fromExecutor(
  Executors.newFixedThreadPool(4)
)
```

**原则**:
- 生产用 `ExecutionContext.Implicits.global`(ForkJoin 池)
- 阻塞 IO 用 `Future { blocking { ... } }` 让 EC 把它分配到独立的线程
- 测试用 `TestExecutionContext` 控制

## 3. for 在 Future 上

```scala
def fetchUser(id: Long): Future[User] = ???
def fetchPrefs(uid: Long): Future[Prefs] = ???

val f: Future[(User, Prefs)] = for
  u <- fetchUser(id)
  p <- fetchPrefs(u.id)
yield (u, p)
// 串行执行!
```

**注意**:
- `for` 在 `Future` 上是**串行**(先 fetchUser 完,再 fetchPrefs)
- 要并行,用 `Future.zip` / `Future.sequence` / `Future.traverse`

## 4. 并行组合

```scala
// zip:并行
val f: Future[(User, Prefs)] = fetchUser(id).zip(fetchPrefs(id))

// traverse:List 全部并行
val fs: Future[List[User]] = Future.traverse(ids)(fetchUser)

// sequence:List[Future] 转 Future[List]
val fs: List[Future[User]] = ids.map(fetchUser)
val combined: Future[List[User]] = Future.sequence(fs)
```

## 5. 错误处理

```scala
val f: Future[Int] = fetchValue()

f.recover { case _: TimeoutException => 0 }              // Future[Int] = 0
f.recoverWith { case e: Throwable => Future.failed(e) }   // 不变
f.failed                                          // Future[Throwable]
f.transform { case Success(v) => Success(v * 2); case Failure(_) => Success(0) }
```

**实战技巧**:
- 用 `recover` 给 Future 一个"兜底"
- 用 `recoverWith` 用另一个 Future 替代
- 不要在 for 内部 try/catch(用 recover)

## 6. Future 的 5 个问题

### 1) 不可控的执行时机

```scala
val f = Future(println("running"))  // 立即跑!
```

### 2) 不可取消

```scala
val f = Future {
  while (true) { ... }  // 无取消
  42
}
```

### 3) 参照不透明

```scala
val f: Future[Int] = Future.successful(1)  // 不知道在哪跑
```

### 4) 错误不强制处理

```scala
val f = Future { throw new Exception }  // 失败,无输出
```

### 5) 阻塞 vs 非阻塞

```scala
def f: Future[Int] = Future { Thread.sleep(1000); 42 }
// await 会阻塞当前线程(可能是 main)
val x: Int = Await.result(f, 5.seconds)
```

## 7. Await 的陷阱

```scala
import scala.concurrent.Await
import scala.concurrent.duration._

val result = Await.result(f, 5.seconds)
```

**`Await` 在生产代码中应只用于**:
- `main` 方法
- 测试代码
- 已知完成的 Future(罕见)

**其他场景**用 `flatMap` / `andThen` 继续组合。

## 8. 实战:并行 API 聚合

```scala
def fetchUser(id: Long): Future[User] = ???
def fetchOrders(uid: Long): Future[List[Order]] = ???
def fetchRecommendations(uid: Long): Future[List[Item]] = ???

def dashboard(uid: Long): Future[Dashboard] =
  (fetchUser(uid), fetchOrders(uid), fetchRecommendations(uid)).mapN(Dashboard.apply)
// 三个 API 并行,任一失败则整体失败
```

## 9. Promise:显式的 Future

```scala
import scala.concurrent.Promise

val p = Promise[Int]()
val f: Future[Int] = p.future

// 另一个线程:
p.success(42)
// 或 p.failure(new Exception)
```

**用途**:
- 把回调 API 包成 Future
- 跨 Actor、跨系统传递"未完成"句柄

## 10. Future 何时用

**用**:
- Scala 2 项目
- 简单异步,不复杂的资源管理
- 与 Java 互操作的库

**不用**:
- 需要取消
- 需要精细控制
- 新项目:优先 cats-effect 的 IO

## 11. 迁移到 IO

```scala
// Future
def fetchUser(id: Long): Future[User] = Future {
  http.get(s"/users/$id")
}

// IO
def fetchUser(id: Long): IO[User] = IO {
  http.get(s"/users/$id")
}
```

**差异**:
- `IO` 不立即跑;需要 `unsafeRunSync()` 显式触发
- `IO` 可取消
- `IO` 有 `Resource` 配对
- `IO` 强制结构化并发

## 12. 检查清单

- [ ] 解释 Future 的本质
- [ ] 写出 ExecutionContext 的两种来源
- [ ] 解释 for 在 Future 上是串行还是并行
- [ ] 解释 Future 的 5 个核心问题
- [ ] 用 zip/traverse 写并行聚合
- [ ] 解释 Await 的使用边界
- [ ] 解释 Promise 的用途
- [ ] 解释何时升级到 cats-effect IO
