# Scala 学习路线图 —— 从入门到专家

> 这是一份**严肃的**学习路径,目标是把读者培养到能拿到一线城市 ¥50K/月 Scala 岗位的工程师。
> 整个仓库围绕这条路线组织:每个模块都对应一次"实战 + 测试"训练。

## 一、市场对 Scala 工程师的真正要求

不要被"语法糖多"误导。Scala 在生产环境中的主流岗位有三类:

1. **大数据/数据工程**(Spark / Flink)—— ¥25K–45K
2. **服务端 / 金融 / 区块链**(Akka / cats-effect / http4s / zio)—— ¥40K–80K
3. **编译器 / 基础设施 / 工具链**(scalac、Mill、IntelliJ 插件)—— ¥45K–100K+

要跨过 ¥50K 的门槛,必须同时具备:

- 对 **Scala 2.13 与 Scala 3.3** 都熟悉(很多公司 2 → 3 迁移中)
- 写出**地道的类型驱动代码**(用类型代替 if/switch/null 检查)
- 理解**函数式编程范式**:Functor / Applicative / Monad / Traverse / Foldable
- 熟悉**生态中的关键库**(cats、cats-effect、fs2、http4s、tapir、circe、doobie 之一)
- 能在**没有 IDE 提示**时也能正确写出隐式/given 链
- 掌握**JVM 互操作**:与 Java 库、注解、反射、字节码打交道
- 知道**何时不要炫技**(Just Use Case Class / Just Use For-Loop)

## 二、四阶段路径

### Phase 1 —— 基础(Beginner → Junior)

> 时长建议:30–50 小时。**不要跳级**。
> 目标:能读懂同事写的 Scala 代码,写出可用的中等复杂度程序。

- **M00 表达力之旅**:30 分钟体验 Scala 的核心价值
- **M01 基础类型与值类**:Any / AnyVal / AnyRef / Nothing / Null / String
- **M02 函数**:一等公民、柯里化、按名参数、`using`
- **M03 类与特质**:主构造器、特质、线性化、自类型
- **M04 ADT 与枚举**:sealed trait / case class / `enum`
- **M07 模式匹配**:字面量 / 类型 / 提取器 / 守卫
- **M08 高阶函数与 SAM**:map/flatMap/fold、闭包、偏应用
- **M11 for 推导**:map/flatMap/withFilter 语法糖
- **M12 错误处理**:Option / Either / Try
- **M13 并发基础**:Future + ExecutionContext

**Phase 1 的验收标准**:
1. 能用 sealed trait + case class 表达 5 种以上领域模型
2. 能用 for 推导在 Either / Option / Future 上串 3 步以上
3. 解释 `Function1[-A, +B]` 为何 A 是逆变、B 是协变
4. 解释 implicit 与 given / using 的等价与差异
5. 跑通本仓库 `sbt +Test/test`

### Phase 2 —— 中级(Junior → Mid-level)

> 时长建议:60–100 小时。**这是拉开差距的阶段**。
> 目标:写出"读起来像 Scala"的代码,理解类型系统,能设计类型安全的 API。

- **M05 类型类**:Show / Eq / Ord / Monoid;派生;`summonFrom`;语法扩展
- **M06 泛型深入**:型变、约束、HKT、抽象类型
- **M09 扩展方法**:implicit class → extension
- **M10 操作符重载**:领域 DSL 设计、自定义 Ordering
- **M14 内联元编程**:inline / transparent inline / compiletime.*
- **M15 高级类型**:路径依赖、依赖方法、类型 lambda
- **M16 Scala 2 ↔ 3 同题对比**:看一次完整迁移
- **COLLECTIONS_DEEP_DIVE**:List/Vector/Map/Set 的复杂度、视图、严格 vs 懒
- **FUNCTIONAL_PATTERNS**:Functor / Monad / Applicative / Traverse / State
- **TESTING**:ScalaTest 风格、scalacheck 属性测试

**Phase 2 的验收标准**:
1. 能为任意 ADT 写出 Show / Eq / Codec 类型类及其派生
2. 解释 `OptionT[F[_], A] = F[Option[A]]` 与原生 `Option[F[A]]` 的差异
3. 写出 `def traverse[G[_]: Applicative, A, B](fa: F[A])(f: A => G[B]): G[F[B]]`
4. 用类型类做依赖注入替代 Spring 风格
5. 解释 `inline` / `transparent inline` / `compiletime.erasedValue` 的关系
6. 至少完成 **PROJECT_BANKING** 的一部分(领域 + Either 流水线)

### Phase 3 —— 高级(Mid-level → Senior)

> 时长建议:80–150 小时。**生态深耕**。
> 目标:能选型、能带项目、能在 PR review 中一眼看出"非地道"代码。

- **CONCURRENCY_DEEP_DIVE**:Future 陷阱、cats-effect IO、Refs、Resource、structured concurrency
- **TYPE_LEVEL_PROGRAMMING**:Peano、Nat、==、Tuple 类型级运算
- **PERFORMANCE**:boxing、@specialized、tailrec、lazy val 陷阱、JVM 互操作
- **ECOSYSTEM**:cats / cats-effect / fs2 / http4s / tapir / circe / doobie 选型
- **BUILD_TOOLS**:sbt 多模块、cross-build、Mill、Scala CLI
- **PROJECT_BANKING**(完成):DDD + cats-effect + http4s 完整微服务
- **PROJECT_STREAMING**:fs2 流处理管道

**Phase 3 的验收标准**:
1. 用 cats-effect IO 写一个 Resource 管理的 HTTP 客户端
2. 用 fs2 Stream 写一个 100 万事件的 backpressure 管道
3. 解释 `IO` 与 `Future` 的本质差异(参照透明性、取消、错误处理)
4. 解释 sealed trait 为什么在 Scala 3 中匹配必须穷尽
5. 用 scalac `-Yexplicit-nulls` 分析一段代码并找出 NPE 风险
6. 独立完成 **PROJECT_BANKING** 全部 6 个子任务

### Phase 4 —— 专家(Senior → Staff/Principal)

> 时长建议:持续。**没有终点**。
> 目标:能写框架/库、能影响团队技术选型、能用 Scala 表达高难度抽象。

- **M14 宏深入**:Scala 3 宏(quoted / reflect)、自定义类型类派生
- **M15 高级类型**:match types、依赖类型、HKD
- **M00 编译器内部**:scalac 的 typer / pattern matcher
- **INTERVIEW_QA**:60 道专家级问答
- **BEST_PRACTICES**:写出能被维护的 Scala 代码
- **OPEN_SOURCE**:阅读 cats / fs2 / scalaz 源码,提交 PR

**Phase 4 的验收标准**:
1. 在 30 分钟内写出一个简单的 Scala 3 inline macro
2. 解释 `cats.Eval` 的 trampoline 与 stack safety
3. 在生产系统里用 cats-effect 替换 Future,无明显回滚
4. 在 PR review 中能指出"这里应该用 Either 还是 Validated"
5. 读过至少 10000 行高质量 Scala 开源代码

## 三、与薪资对应的能力清单

| 能力 | ¥15K | ¥30K | ¥50K | ¥80K+ |
|------|------|------|------|-------|
| 写 case class / for / Option | ✅ | ✅ | ✅ | ✅ |
| 解释 implicit 解析 | — | ✅ | ✅ | ✅ |
| 写自定义类型类 | — | ✅ | ✅ | ✅ |
| 区分 cats / scalaz 风格 | — | — | ✅ | ✅ |
| 用 cats-effect / fs2 | — | — | ✅ | ✅ |
| 写出无 boxing 的 hot path | — | — | — | ✅ |
| 用 Scala 3 inline 元编程 | — | — | — | ✅ |
| 参与 Scala 3 宏编写 | — | — | — | ✅ |

## 四、本仓库的章节对应表

| 章节 | 阶段 | 估算时长 |
|------|------|----------|
| [M00 表达力之旅](modules/M00_EXPRESSIVENESS.md) | 1 | 1h |
| [M01 基础类型](modules/01_basics.md) | 1 | 3h |
| [M02 函数](modules/02_functions.md) | 1 | 4h |
| [M03 类与特质](modules/03_classes_traits.md) | 1 | 5h |
| [M04 ADT 与枚举](modules/04_sealed_adts.md) | 1 | 3h |
| [M05 类型类](modules/05_typeclasses.md) | 2 | 6h |
| [M06 泛型](modules/06_generics.md) | 2 | 5h |
| [M07 模式匹配](modules/07_pattern_matching.md) | 1 | 3h |
| [M08 高阶函数](modules/08_hof_sam.md) | 1 | 3h |
| [M09 扩展方法](modules/09_extensions.md) | 2 | 3h |
| [M10 操作符](modules/10_operators.md) | 2 | 2h |
| [M11 for 推导](modules/11_for_collections.md) | 1 | 3h |
| [M12 错误处理](modules/12_error_handling.md) | 1 | 3h |
| [M13 并发基础](modules/13_concurrency.md) | 1 | 4h |
| [M14 内联元编程](modules/14_macros_meta.md) | 2 | 5h |
| [M15 高级类型](modules/15_advanced_types.md) | 2 | 5h |
| [M16 同题对比](modules/16_diff.md) | 2 | 2h |
| [M17 集合深入](modules/M17_COLLECTIONS.md) | 2 | 6h |
| [M18 函数式模式](modules/M18_FUNCTIONAL_PATTERNS.md) | 2 | 8h |
| [M19 并发深入](modules/M19_CONCURRENCY_DEEP.md) | 3 | 8h |
| [M20 类型级编程](modules/M20_TYPE_LEVEL.md) | 3 | 6h |
| [M21 性能调优](modules/M21_PERFORMANCE.md) | 3 | 4h |
| [M22 生态选型](modules/M22_ECOSYSTEM.md) | 3 | 4h |
| [M23 测试](modules/M23_TESTING.md) | 2 | 3h |
| [M24 构建工具](modules/M24_BUILD_TOOLS.md) | 3 | 3h |
| [M25 银行项目](modules/M25_PROJECT_BANKING.md) | 3 | 10h |
| [M26 流处理项目](modules/M26_PROJECT_STREAMING.md) | 3 | 6h |
| [INTERVIEW_QA](INTERVIEW_QA.md) | 4 | 8h |
| [BEST_PRACTICES](BEST_PRACTICES.md) | 4 | 3h |
| [SYNTAX_CHEATSHEET](SYNTAX_CHEATSHEET.md) | 参考 | — |

**总投入**:约 130 小时的纯学习时间(不计项目实战)。

## 五、学习方法建议

1. **先读 REPL**:很多概念用 `scala-cli` 或 sbt console 一行一行敲,胜过看 10 页文字
2. **每个模块跑通测试**:不理解就写不出测试,写不出测试就说明没理解
3. **反推**:看到一段优雅的 Scala 代码,问"它为什么这么写",比读 10 篇文章更有效
4. **拒绝语法糖堆砌**:能用 `match` 表达就不要用奇怪的符号重载
5. **看源码**:cats、scodec、http4s 的源码,比任何教程都更地道

## 六、推荐工具链

| 工具 | 用途 | 何时装 |
|------|------|--------|
| sbt 1.9+ | 标准构建 | 现在 |
| scala-cli 1.5+ | 脚本/REPL | 现在 |
| IntelliJ IDEA + Metals | IDE | 现在 |
| bloop | 快速增量编译 | 装 IDEA 时一并 |
| scalafix + scalafmt | 代码风格 | Phase 2 |
| scalacOptions -Werror | 编译期严格 | Phase 2 |
| Coursier | 二进制分发 | 现在 |

## 七、不要做的事

- ❌ **不要背语法**:Scala 语法太多,背不完。理解**何时用**更重要
- ❌ **不要把 Scala 当 Java 写**:你只是写 Java-with-less-boilerplate
- ❌ **不要滥用 implicit 转换**:用扩展方法
- ❌ **不要在 hot path 用 var**:val 优先
- ❌ **不要把 Future 当 IO**:这是新人最大错误
- ❌ **不要跳过类型类**:这是 Scala 的灵魂
- ❌ **不要被 Cats 吓到**:先看 `cats.Functor`,再看 `cats.Monad`,一次只学一个
