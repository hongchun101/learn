# M23 测试策略

> Phase 3 高级模块。测试是 Scala 项目的"基本卫生"。

## 1. 测试框架选择

| 框架 | 风格 | 何时用 |
|------|------|--------|
| ScalaTest | AnyFunSuite / AnyWordSpec / AnyPropSpec | 老牌,生态最广 |
| MUnit | 简洁,IO 友好 | 新项目 |
| Weaver | 类型安全,catseffect 集成 | FP 风格项目 |
| Specs2 | BDD 风格 | 习惯 BDD 的团队 |
| μTest | 最轻量 | 库作者 |

**推荐**:
- 学习 / 通用项目:ScalaTest
- cats-effect 项目:weaver 或 MUnit
- 库作者:μTest(轻,无依赖)

## 2. ScalaTest 实战

```scala
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers

class UserServiceSpec extends AnyFunSuite with Matchers:
  test("loadUser returns user when found"):
    val service = UserService(mockRepo)
    val u = service.getUser(42).unsafeRunSync()
    u.name shouldBe "ada"

  test("loadUser returns None when missing"):
    val u = service.getUser(-1).unsafeRunSync()
    u shouldBe None
```

## 3. 属性测试 (ScalaCheck)

```scala
import org.scalacheck.Properties
import org.scalacheck.Prop.*

object ListReverseSpec extends Properties("List.reverse"):
  property("reverse(reverse(xs)) == xs") = forAll { (xs: List[Int]) =>
    xs.reverse.reverse == xs
  }

  property("reverse(xs).length == xs.length") = forAll { (xs: List[Int]) =>
    xs.reverse.length == xs.length
  }
```

**为什么用属性测试?**
- 跑"对所有输入"都该成立的规则
- 自动找边界条件
- 让你写"说明书"而不是"具体例子"

**实战**:
- 业务规则:`sumAll` 是交换律吗?
- 数学函数:`reverse` 是 involution 吗?
- 序列化:`decode . encode == identity`?

## 4. 测试 cats-effect 代码

```scala
import cats.effect.*
import cats.effect.unsafe.implicits.global

class IOSpec extends AnyFunSuite:
  test("async operation"):
    val io: IO[Int] = IO {
      Thread.sleep(10)
      42
    }
    assert(io.unsafeRunSync() == 42)
```

**更好的方式:用 weaver**

```scala
import weaver.*
import cats.effect.*

object HttpSpec extends SimpleIOSuite:
  test("GET /users/42 returns user"):
    httpClient.get("/users/42").map { resp =>
      expect(resp.status == 200)
      expect(resp.body.name == "ada")
    }
```

**优势**:
- 测试用 cats-effect IO 编写,自动运行
- 类型安全的 expect
- 与 Effectful 生态对齐

## 5. 测试异步代码

**反例**:用 Thread.sleep 等异步完成
```scala
val f = Future { 42 }
Thread.sleep(100)  // 等待
assert(f.value == Some(Success(42)))
```

**正例**:
```scala
val f: Future[Int] = Future { 42 }
f.map(x => assert(x == 42))
// future 完成时,assert 也会跑
```

或者用 `Await`:
```scala
val r = Await.result(f, 1.second)
assert(r == 42)
```

## 6. 测试需要时间的代码

```scala
import scala.concurrent.duration.*

// cats-effect TestControl
import cats.effect.testkit.TestControl

test("timeout works") {
  TestControl.execute(prog) flatMap { ctl =>
    for
      _ <- prog.start
      _ <- ctl.advanceAndTimeOut(3.seconds)
      _ <- ctl.results.assertEquals(...)
    yield success
  }
}
```

**实战**:用 `IO.sleep` 而非 `Thread.sleep`,让你的测试可以"快进"。

## 7. Mock 策略

### 1) 用类型类

```scala
trait UserRepo:
  def find(id: Long): IO[Option[User]]

class MockUserRepo extends UserRepo:
  def find(id: Long): IO[Option[User]] = IO.pure(Some(User(id, "mock")))

// 测试:
val service = UserService(new MockUserRepo)
```

### 2) 用库(mockito / munit-mockito)

```scala
import org.mockito.Mockito.*
val mock = mock(classOf[UserRepo])
when(mock.find(42L)).thenReturn(IO.pure(Some(User(42, "ada"))))
```

### 3) 用 Ref / State (FP 风格)

```scala
class InMemoryUserRepo(ref: Ref[IO, Map[Long, User]]) extends UserRepo:
  def find(id: Long): IO[Option[User]] = ref.get.map(_.get(id))
  def save(user: User): IO[Unit] = ref.update(_.updated(user.id, user))
```

**实战推荐**:**用类型类 + 真实现**(in-memory 数据库)代替 mock。

## 8. 集成测试 vs 单元测试

| 类型 | 范围 | 速度 | 数量 |
|------|------|------|------|
| 单元 | 单个函数 | 1ms | 大量 |
| 集成 | 多组件 | 1s | 一些 |
| 端到端 | 全栈 | 10s+ | 少量 |

**实战**:
- **80% 单元**:核心业务逻辑、类型类、纯函数
- **15% 集成**:Repository + Service,真实数据库
- **5% E2E**:HTTP + DB,放在 CI 的"重"测试阶段

## 9. 测试覆盖率

```scala
// sbt-scoverage 插件
enablePlugins(ScoveragePlugin)

scovReport := Some(ScovReport.HtmlReport(...
```

**生产建议**:
- 覆盖率 ≠ 质量
- 80% 覆盖率,核心模块 95%+
- 不要为覆盖率写假测试

## 10. Mutation Testing (ScalaMeter / Stryker4s)

Mutation testing 故意改一行代码,看你的测试能不能发现。

```scala
// 原始
def add(a: Int, b: Int): Int = a + b

// 突变
def add(a: Int, b: Int): Int = a - b  // 改成 -

// 你的测试 assert(add(2, 3) == 5) 应该挂
```

**实战**:Stryker4s 是 Scala 生态的 mutation testing 工具。

## 11. 测试组织

```
src/
├── main/scala/
│   ├── domain/      // 业务模型
│   ├── service/     // 业务逻辑
│   ├── repo/        // 数据访问
│   └── api/         // HTTP / RPC
└── test/scala/
    ├── domain/
    ├── service/     // 单元测试
    ├── repo/        // 集成测试
    └── api/         // E2E 测试
```

**实践**:
- 测试代码与生产代码**结构对齐**
- 用 `package` 而非多个 sbt 子项目(避免编译慢)

## 12. CI 中的测试

```yaml
# .github/workflows/ci.yml
- name: Test
  run: sbt +Test/test
- name: Coverage
  run: sbt coverage test coverageReport
```

**原则**:
- CI 必须跑测试(没商量)
- 慢测试单独 job
- 失败的测试**不能合 master**

## 13. 检查清单

- [ ] 解释 ScalaTest、MUnit、weaver 的差异
- [ ] 写一个 ScalaTest 单元测试
- [ ] 写一个 ScalaCheck 属性测试
- [ ] 解释为什么"用真实实现代替 mock"更好
- [ ] 解释 cats-effect 测试的 TestControl
- [ ] 解释 mutation testing 的作用
- [ ] 设置 sbt-scoverage 并解读报告
