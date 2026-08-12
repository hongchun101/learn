# Scala 最佳实践

> Phase 4 模块。写出"能维护、能面试、能进 PR"的 Scala 代码。

## 1. 不可变性

**默认**:
- `val` 优先
- 不可变集合优先(`List`、`Vector`、`Map`)
- 不可变领域模型(case class + copy)

**可变**:
- 仅在性能敏感的内部循环
- 隐藏在 API 后面(对外仍不可变)
- 用 `cats.effect.Ref` 或 `Atomic` 而非裸 `var`

```scala
// 反例
var sum = 0
for x <- xs do sum += x

// 正例
val sum = xs.sum
```

## 2. 表达式风格

**用表达式而非语句**:

```scala
// 反例
def status(code: Int): String = {
  if (code == 200) return "OK"
  if (code == 404) return "NotFound"
  return "Unknown"
}

// 正例
def status(code: Int): String = code match
  case 200 => "OK"
  case 404 => "NotFound"
  case _   => "Unknown"
```

## 3. 命名约定

| 类型 | 风格 | 例 |
|------|------|-----|
| 类 / 特质 | PascalCase | `List`、`Functor` |
| 方法 / 值 | camelCase | `map`、`headOption` |
| 类型参数 | A, B, F, T | 单字母大写 |
| 隐式 / given | 描述性 | `showInt`、`orderingForList` |
| 常量 | PascalCase 或全大写 | `MaxValue` |
| 包 | 全小写 | `com.learning.collections` |
| 私有字段 | 无下划线前缀 | `private val state = ...` |

**避免**:
- 缩写(`val cfg = ...` 不如 `val config = ...`)
- 类型作前缀(`StringOps`、`UserDTO` 都不好)

## 4. 显式返回类型

**公共 API 必须显式标注返回类型**。内部函数可选。

```scala
// 公共 API
def parseUser(json: String): Either[ParseError, User] = ???

// 内部函数
private def helper = ???  // 可省略
```

**理由**:
- API 文档清楚
- 防止意外重载(同名不同返回类型)
- 编译器在重构时能更早报错

## 5. 错误处理

**业务错误 → `Either`**:
```scala
def loadUser(id: Long): Either[AppError, User]
```

**副作用边界 → `IO`**:
```scala
def loadUserIO(id: Long): IO[User] = ???
```

**程序错误 → 抛**:
```scala
def requirePositive(x: Int): Int =
  require(x > 0, s"x must be positive: $x")
```

**避免**:
- `null`
- 抛异常处理业务逻辑
- 在 `Either` 与 `Try` 间反复

## 6. 何时用类型类 vs OOP

**默认用类型类**:
- 给已有类型加能力
- 跨多个实现共享
- 派生类型类的实例

**用 OOP**:
- 业务上的 IS-A 关系
- 需要继承 + override
- 状态机

## 7. 何时用隐式/given

**用**:
- 类型类实例
- `ExecutionContext`、`Ordering` 这类"上下文"
- 派生类型类

**不用**:
- 隐式转换(用 extension)
- 业务参数
- 隐式 StringBuilder / 隐式数字转换(太魔法)

## 8. for 推导

**用 for 当**:
- 多步链式
- 多生成器
- 需要模式匹配解构
- 多层 Either / Option / Future

**不用 for 当**:
- 一步的 `map`
- 一步的 `flatMap`
- 性能关键时(for 编译后等价,无差异)

## 9. 集合选择

| 场景 | 用 |
|------|-----|
| 频繁 prepend | List |
| 频繁随机访问 | Vector |
| 大小未知,需两端 append | Vector |
| 大量 append(收集后用) | ListBuffer.build.toList |
| 需要去重 | Set |
| 需要按键查 | Map |
| 大量元素,内存敏感 | Array |
| 无限序列 | LazyList |

**永远不要**:
- 用 `List.append`(:+)
- 用 `null` 表示空
- 在 List 上做随机访问

## 10. 字符串拼接

```scala
// 反例
var s = ""
for x <- xs do s += x

// 正例
xs.mkString
xs.mkString("[", ",", "]")
new StringBuilder().appendAll(xs).toString
```

## 11. null 处理

**永远不要返回 `null`**:
- 用 `Option[T]` 表达"可能没有"
- 用 `Either[L, R]` 表达"可能失败"
- 用 `Try[T]` 表达"可能抛"

**Scala 3**:`-Yexplicit-nulls` 强制标注可空类型。

## 12. 包设计

```scala
// 按"层"分
package com.example.bank
package com.example.bank.domain     // 业务模型
package com.example.bank.service    // 业务逻辑
package com.example.bank.repo       // 数据访问
package com.example.bank.api        // HTTP
```

**避免**:
- 太深的嵌套(超过 4 层)
- 单文件多个包
- 跨包"内部"互相引用

## 13. 文档注释

所有公共 API 用 Scaladoc:

```scala
/**
 * 解析用户。
 *
 * @param id 用户 ID
 * @return 成功返回用户,失败返回 AppError
 */
def loadUser(id: Long): Either[AppError, User]
```

**`@param`、`@return`、`@throws`、`@see`、`@since`、`@note`** 都用上。

## 14. 测试

**每加一个公共函数,加至少一个测试**。
测试覆盖:
- 正常路径
- 边界(empty、null、max、min)
- 失败路径

**反例**:
- 写了 100% 公共 API,但测试只覆盖 happy path
- 复制粘贴测试,改名字

## 15. 编译选项

```scala
scalacOptions ++= Seq(
  "-deprecation",
  "-feature",
  "-unchecked",
  "-Xlint",
  "-Werror",
  "-Wconf:cat=unused:info",  // 静默 unused
  "-Yexplicit-nulls",         // Scala 3
  "-Wsafe-init"               // Scala 3
)
```

**不要**:
- 关 `-Werror`(会让 warning 堆积)
- 把 unused 当 error(会刷屏)

## 16. Scalafmt + Scalafix

```scala
// .scalafmt.conf
version = "3.8.0"
maxColumn = 100
align.preset = none
```

```bash
# CI 跑
sbt scalafmtCheckAll
sbt scalafixCheckAll
```

**好处**:
- 团队代码风格统一
- PR diff 关注逻辑而非格式
- Scalafix 自动修(去掉 unused import 等)

## 17. 性能 checklist

- [ ] 没有热路径上的 `List :+`
- [ ] 没有 Scala 2 的 `Stream`(用 `LazyList`)
- [ ] 没有 N+1 查询
- [ ] 没有 boxing 重灾区(给 `@specialized`)
- [ ] 大数据集合用 `Vector` 而非 `List`
- [ ] 字符串拼接用 `StringBuilder` / `mkString`
- [ ] 递归用 `@tailrec`

## 18. 反模式

| 反模式 | 替代 |
|--------|------|
| `null` | `Option` |
| 抛异常处理业务错误 | `Either` |
| `var` 在多个方法共享 | 不可变 + 显式传递 |
| `package object` 大杂烩 | 顶级定义 + 显式 import |
| `implicit def A => B` | extension method |
| 巨型 `class` | 小 class + 类型类 |
| `asInstanceOf` 滥用 | 模式匹配 + 类型类 |
| `Future` 在 IO 上下文 | `IO` |
| `Thread.sleep` 测试 | `IO.sleep` + TestControl |
| `null` 检查 | 模式匹配 |

## 19. 库的选型决策

**问自己**:
1. 我真的需要这个库吗?(是否标准库已够)
2. 这个库仍在维护吗?(GitHub 活跃度)
3. 团队都熟悉吗?(学习成本)
4. 文档清晰吗?
5. 有多少人用过?(生产案例)

**反例**:
- 引入 5 个库只为了 1 个 utility
- 用了 3 年的冷门库(没维护了)
- 库依赖版本冲突

## 20. 升级与迁移

**Scala 2 → 3**:
1. 用 `-source:future` 渐进替换
2. 先开 `using` / `given`(语法兼容)
3. 再把 `package object` 拆
4. 用 `enum` 替代 `sealed trait + case object`
5. 用 `extension` 替代 `implicit class`

**库升级**:
- 一次只升一个大版本
- 升前看 changelog
- 测试覆盖率要够(否则没信心)

## 21. 团队协作

- **Code Review** —— 每个 PR 至少 1 人 review
- **Style** —— Scalafmt / Scalafix 必须过 CI
- **测试** —— 测试覆盖率作为合并门槛
- **文档** —— 关键决策写 ADR(架构决策记录)

## 22. 检查清单

- [ ] 写代码默认用 `val`
- [ ] 业务错误用 `Either`
- [ ] 公共 API 显式返回类型
- [ ] 不用 `null`
- [ ] 不用隐式 conversion
- [ ] 用类型类默认 OOP
- [ ] 集合选型明确
- [ ] 测试覆盖边界
- [ ] Scalafmt / Scalafix 过 CI
- [ ] 编译选项开启
