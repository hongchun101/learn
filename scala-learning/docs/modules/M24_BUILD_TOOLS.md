# M24 构建工具

> Phase 3 高级模块。选对你的构建工具,开发体验翻倍。

## 1. 工具对比

| 工具 | 优势 | 劣势 | 何时用 |
|------|------|------|--------|
| sbt | 生态最广,build.sbt 灵活 | 慢,启动慢,配置复杂 | 90% 项目 |
| Mill | 极快,配置简单 | 生态较小 | 新项目、库作者 |
| scala-cli | 0 配置,REPL 友好 | 不适合大项目 | 脚本、学习、试错 |
| Bloop | 增量编译服务器 | 已被 sbt / Mill 吸收 | IDE 后端 |

**推荐**:
- 主流项目:sbt
- 库作者:Mill
- 脚本/学习:scala-cli
- 试错 REPL:scala-cli 或 sbt console

## 2. sbt 必知

### 项目结构

```
project-root/
├── build.sbt
├── project/
│   ├── build.properties     # sbt 版本
│   └── plugins.sbt          # sbt 插件
├── modules/
│   ├── core/                # 核心模块
│   │   ├── src/main/scala
│   │   └── src/test/scala
│   └── api/                 # API 模块
└── target/                  # 编译产物
```

### 多模块 build.sbt

```scala
// build.sbt
ThisBuild / organization := "com.example"
ThisBuild / scalaVersion := "3.3.3"
ThisBuild / version      := "0.1.0"

lazy val commonDeps = Seq(
  "org.typelevel" %% "cats-core" % "2.10.0",
  "org.typelevel" %% "cats-effect" % "3.5.4"
)

lazy val core = (project in file("core"))
  .settings(
    libraryDependencies ++= commonDeps,
    libraryDependencies += "org.typelevel" %% "cats-effect" % "3.5.4"
  )

lazy val api = (project in file("api"))
  .dependsOn(core)
  .settings(
    libraryDependencies ++= Seq(
      "org.http4s" %% "http4s-dsl" % "0.23.18",
      "org.http4s" %% "http4s-ember-server" % "0.23.18"
    )
  )

lazy val root = (project in file("."))
  .aggregate(core, api)
  .settings(Compile / sources := Seq.empty)
```

### cross-build(2.13 + 3.3)

```scala
// project/plugins.sbt
addSbtPlugin("org.scala-js"       % "sbt-scalajs"       % "1.13.2")
addSbtPlugin("org.scala-native"   % "sbt-scala-native"   % "0.4.17")

// build.sbt
lazy val core = crossProject(JSPlatform, JVMPlatform, NativePlatform)
  .crossType(CrossType.Pure)
  .settings(...)
```

### 常用 sbt 命令

```bash
sbt                    # 进入 sbt shell
sbt compile            # 编译
sbt test               # 跑测试
sbt +Test/compile      # 跨所有 aggregate compile
sbt +Test/test         # 跨所有 aggregate test
sbt "project core"     # 切换到 core 子项目
sbt "core/Test/test"   # 跑 core 的 test
sbt reload             # 重新加载 build.sbt
sbt clean              # 清理 target
```

### scalacOptions

```scala
Compile / scalacOptions ++= Seq(
  "-deprecation",
  "-feature",
  "-unchecked",
  "-Xlint",
  "-Werror",                            // 警告视为错误
  "-Wconf:cat=unused:info",             // 静默 unused
  "-Yexplicit-nulls",                   // Scala 3 显式 null
  "-Wsafe-init",                        // Scala 3 字段初始化检查
  "-Wnonunit-statement"                 // Scala 3 单语句块
)
```

## 3. Mill 入门

```scala
// build.sc
import mill._

object core extends ScalaModule {
  def scalaVersion = "3.3.3"
  def ivyDeps = Agg(
    ivy"org.typelevel::cats-core:2.10.0",
    ivy"org.typelevel::cats-effect:3.5.4"
  )
}

object api extends ScalaModule {
  def scalaVersion = "3.3.3"
  def moduleDeps = Seq(core)
  def ivyDeps = Agg(
    ivy"org.http4s::http4s-dsl:0.23.18"
  )
}
```

**优势**:
- 启动比 sbt 快 5-10 倍
- 增量编译比 sbt 快 2-3 倍
- 配置文件 = Scala 代码,完全类型安全

**何时用**:
- 新项目、追求开发体验
- 库作者(编译快 = PR 反馈快)
- 团队愿意学新工具

## 4. scala-cli 入门

```scala
//> using scala 3.3.3
//> using dep org.typelevel::cats-core:2.10.0

@main def hello(name: String): Unit =
  println(s"hello, $name")
```

```bash
scala-cli hello.scala
scala-cli run hello.scala -- name=ada
scala-cli repl
scala-cli compile hello.scala
```

**实战**:
- 写小脚本
- 试错 REPL
- 教学(无需 sbt 知识)
- 单文件项目

## 5. 编译时间优化

```scala
// 1) 用 Zinc 缓存
sbt --supershell=never  # 启动更快

// 2) 减少 sbt 子项目
// 3) 用 Bloop / Mill 替代 sbt

// 4) 减少 macro / 反射使用
scalacOptions ++= Seq(
  "-Ystop-after:typer"  // 跳过代码生成阶段
)

// 5) incremental compilation:避免删文件、避免大规模重构
```

## 6. 持续集成 (CI)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - run: sbt +Test/test
      - run: sbt scalafmtCheckAll
      - run: sbt scalafixCheckAll
```

**CI 优化**:
- 缓存 `~/.cache/coursier` 和 `~/.sbt`
- 缓存 `target/`
- 用 `sbt --client` 复用 JVM

## 7. 依赖管理

```scala
// build.sbt
libraryDependencies ++= Seq(
  "org.typelevel"     %% "cats-core"      % "2.10.0",  // %% 自动加 scala 版本
  "org.http4s"        %% "http4s-dsl"     % "0.23.18",
  "org.typelevel"     %% "cats-effect"    % "3.5.4"   % Test  // 仅测试
)
```

**版本管理**:
```scala
// project/Dependencies.scala
import sbt.librarymanagement.*

object V:
  val cats       = "2.10.0"
  val catsEffect = "3.5.4"
  val http4s     = "0.23.18"
  val circe      = "0.14.6"
```

## 8. 发布到 Sonatype / Maven Central

```scala
// project/plugins.sbt
addSbtPlugin("com.github.sbt"   % "sbt-pgp"         % "2.2.1")
addSbtPlugin("com.github.sbt"   % "sbt-sonatype"    % "3.9.21")

// build.sbt
ThisBuild / organization := "com.example"
ThisBuild / homepage     := Some(url("https://github.com/example/lib"))
ThisBuild / licenses     := List("Apache-2.0" -> url("..."))
ThisBuild / developers   := List(Developer("me", "me@example.com", "...", ...))

lazy val lib = (project in file("."))
  .settings(
    name := "my-lib",
    publish / skip := false,
    sonatypePublishToBundle := true
  )
```

```bash
sbt publishSigned
sbt sonatypeBundleRelease
```

## 9. Scala Native / Scala.js

**Scala Native** —— 把 Scala 编译为原生二进制(无 JVM)
**Scala.js** —— 把 Scala 编译为 JavaScript

```scala
// project/plugins.sbt
addSbtPlugin("org.scala-js"     % "sbt-scalajs"     % "1.13.2")
addSbtPlugin("org.scala-native" % "sbt-scala-native" % "0.4.17")

// build.sbt
enablePlugins(ScalaJSPlugin)
scalaJSLinkerConfig ~= { _.withModuleKind(ModuleKind.CommonJSModule) }
```

## 10. 工具链组合

| 场景 | 推荐 |
|------|------|
| 学习 | sbt + scala-cli |
| 新项目 | sbt 或 Mill + 你的库 |
| 库 | sbt 或 Mill + sbt-sonatype |
| 多平台 | sbt cross-build 或 Mill |
| 脚本 | scala-cli |
| 教学 | scala-cli |

## 11. 检查清单

- [ ] 解释 sbt / Mill / scala-cli 的差异
- [ ] 写一个多模块 sbt 项目
- [ ] 写一个 Mill build.sc
- [ ] 解释 cross-build 的场景
- [ ] 解释 scalacOptions 的关键项
- [ ] 解释 CI 中如何加速 sbt
- [ ] 配置 sbt-sonatype 发布到 Maven Central
