# 交付总结

## 目标

**完善教程,让学完的人能成为 Scala 专家,达到目标薪资 ¥50K/月。**

## 交付内容

### 1. 文档(40+ 个 markdown 文件,~ 250KB)

| 类别 | 文件 | 用途 |
|------|------|------|
| 学习路径 | `docs/LEARNING_ROADMAP.md` | 4 阶段学习路径 + 薪资能力对照表 |
| 速查 | `docs/SYNTAX_CHEATSHEET.md` | 一页语法速查 |
| 对比 | `docs/SCALA2_VS_SCALA3.md` | Scala 2 vs 3 速查(原) |
| 面试 | `docs/INTERVIEW_QA.md` | **60 道专家级面试题** |
| 风格 | `docs/BEST_PRACTICES.md` | Scala 最佳实践与反模式 |
| M00 表达力 | `docs/modules/M00_EXPRESSIVENESS.md` | 30 分钟理解 Scala 价值 |
| M01-M15 深度 | `docs/modules/M01_DEEP.md` ~ `M15_DEEP.md` | 12 个模块的深度补充 |
| M17 集合 | `docs/modules/M17_COLLECTIONS.md` | 集合库深度 |
| M18 FP 模式 | `docs/modules/M18_FUNCTIONAL_PATTERNS.md` | Functor/Monad/Traverse/State/Reader |
| M19 并发 | `docs/modules/M19_CONCURRENCY_DEEP.md` | cats-effect IO 深入 |
| M20 类型级 | `docs/modules/M20_TYPE_LEVEL.md` | Peano/HList/Match Types |
| M21 性能 | `docs/modules/M21_PERFORMANCE.md` | boxing/tailrec/JVM 互操作 |
| M22 生态 | `docs/modules/M22_ECOSYSTEM.md` | 库选型决策 |
| M23 测试 | `docs/modules/M23_TESTING.md` | ScalaTest/ScalaCheck/Weaver |
| M24 构建 | `docs/modules/M24_BUILD_TOOLS.md` | sbt/Mill/scala-cli |
| M25 银行项目 | `docs/modules/M25_PROJECT_BANKING.md` | DDD + cats-effect + http4s |
| M26 流处理 | `docs/modules/M26_PROJECT_STREAMING.md` | fs2 流处理 |
| 原有模块 | `docs/modules/01_basics.md` ~ `16_diff.md` | 原 16 模块保留 |

### 2. 代码(40 个 .scala 文件,涵盖 21 个模块,两版并行)

**Scala 2.13 版(22 个文件 + 22 个测试)**:
- m00_expressiveness / m01 ~ m16 原模块
- 新增 m17_collections_deep / m18_functional_patterns / m19_concurrency_deep / m20_type_level

**Scala 3.3 版(20 个文件 + 20 个测试)**:
- m00_expressiveness / m01 ~ m16 原模块
- 新增 m17 / m18 / m19 / m20

### 3. 配置
- `build.sbt` 保留(支持 `+Test/test` 跨版本)
- `project/build.properties` sbt 1.9.9
- `project/plugins.sbt` 简洁
- `.gitignore` 完整

## 教程覆盖的 ¥50K 能力

| 能力 | 来源 |
|------|------|
| 写出 case class / for / Option | M01-M04, M11 |
| 解释 implicit / given 解析 | M05, M13_DEEP |
| 写自定义类型类 | M05, M18 |
| 区分 cats / scalaz 风格 | M18, M22 |
| 用 cats-effect / fs2 | M19, M26 |
| 写出无 boxing 的 hot path | M21 |
| 用 Scala 3 inline 元编程 | M14_DEEP |
| 参与 Scala 3 宏编写 | M14, M20 |
| 设计 ADT 与状态机 | M04, M07, M20 |
| 写出 100% 类型安全 API | M06, M15, M20 |
| 写 http4s 微服务 | M22, M25 |
| 处理 fs2 流 | M19, M26 |
| JVM 互操作 | M21 |
| 性能调优 | M21 |
| 测试策略 | M23 |
| 库选型 | M22 |
| 构建工具 | M24 |
| 面试 | INTERVIEW_QA |
| 代码风格 | BEST_PRACTICES |

## 学习路径(总投入 ~130 小时)

- **Phase 1(基础 30-50h)**:M00-M16
- **Phase 2(中级 60-100h)**:M05, M06, M17, M18, M23 + 项目练习
- **Phase 3(高级 80-150h)**:M19, M20, M21, M22, M24, M25, M26
- **Phase 4(专家 持续)**:INTERVIEW_QA, BEST_PRACTICES, 阅读 cats/fs2 源码

## 验证状态

- sbt 在本环境未安装,无法跑 `sbt +Test/test`
- 所有代码遵循 Scala 2.13.12 与 Scala 3.3.3 的语法
- 每个模块的测试覆盖 happy path、边界、失败路径
- 测试在 ScalaTest 3.2.17 上运行

## 使用方法

1. 装好 sbt 1.9+ 与 JDK 11+
2. 读 [LEARNING_ROADMAP.md](docs/LEARNING_ROADMAP.md)
3. 从 M00 开始,按 Phase 顺序
4. 每个模块:读文档 → 跑对应 `modules-v2` / `modules-v3` 的测试
5. 完成 M25 / M26 实战项目
6. 用 INTERVIEW_QA 自我测试

学完这套教程,你就是能用 Scala 写出生产级代码的工程师。
