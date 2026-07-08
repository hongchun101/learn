// ============================================================================
// Scala 高级语法学习项目构建定义
// ----------------------------------------------------------------------------
// 聚合 modulesV2 (Scala 2.13) 与 modulesV3 (Scala 3.3+) 两个子项目，
// 共享一组公共设置：scalac 选项、ScalaTest 依赖、源目录约定。
// ============================================================================

ThisBuild / organization := "com.learning"
ThisBuild / version      := "0.1.0"
ThisBuild / scalaVersion := "2.13.12" // 仅在根项目上提供默认版本；子项目覆盖

// 通用 scalac 选项：警告视为信息（便于学习时不至于因弃用 API 失败）
lazy val commonScalacOptions = Seq(
  "-deprecation",
  "-feature",
  "-unchecked",
  "-Xlint",
  "-language:implicitConversions",
  "-language:reflectiveCalls"
)

// 跨版本共用的 ScalaTest 配置
lazy val scalaTestVersion = "3.2.17"

lazy val commonTestDeps =
  ("org.scalatest" %% "scalatest" % scalaTestVersion % Test).withSources()

// ----------------------------------------------------------------------------
// modulesV2 —— Scala 2.13 子项目
// ----------------------------------------------------------------------------
lazy val modulesV2 = (project in file("modules-v2"))
  .settings(
    name := "scala-learning-modules-v2",
    scalaVersion := "2.13.12",
    scalacOptions ++= commonScalacOptions ++ Seq(
      "-Ypartial-unification", // 启用 partial unification
      "-Wconf:cat=unused:info" // 把 unused 警告降为 info，不让它阻断 build
    ),
    libraryDependencies += commonTestDeps,
    // 源目录与测试目录的默认值与 sbt 共识一致，此处显式写明便于跨 IDE 阅读
    Compile / scalaSource := baseDirectory.value / "src" / "main" / "scala",
    Test    / scalaSource := baseDirectory.value / "src" / "test" / "scala"
  )

// ----------------------------------------------------------------------------
// modulesV3 —— Scala 3.3+ 子项目
// ----------------------------------------------------------------------------
lazy val modulesV3 = (project in file("modules-v3"))
  .settings(
    name := "scala-learning-modules-v3",
    scalaVersion := "3.3.3",
    scalacOptions ++= commonScalacOptions ++ Seq(
      "-Ykind-projector", // 启用 kind-projector 语法糖（虽然 3.3 已内置，这里以依赖方式补全）
      "-Wconf:cat=unused:info"
    ),
    libraryDependencies += commonTestDeps,
    Compile / scalaSource := baseDirectory.value / "src" / "main" / "scala",
    Test    / scalaSource := baseDirectory.value / "src" / "test" / "scala"
  )

// ----------------------------------------------------------------------------
// 根项目聚合：sbt +Test/compile 即可跨两个子项目编译
// ----------------------------------------------------------------------------
lazy val root = (project in file("."))
  .aggregate(modulesV2, modulesV3)
  .settings(
    name := "scala-learning",
    // 根项目自身不编译；只作为聚合
    Compile / sources := Seq.empty
  )
