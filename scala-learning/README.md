# Scala 学习教程 —— 从入门到专家

> **目标:学完本教程,达到一线城市 ¥50K+ Scala 工程师水平。**
> 涵盖 Scala 2.13 与 Scala 3.3+ 的全部核心与高级语法,以及函数式编程、并发、生态、面试与最佳实践。

## 仓库结构

```
scala-learning/
├── build.sbt                          # sbt 多模块聚合
├── project/                           # sbt 插件与版本
├── docs/                              # 全部学习材料
│   ├── LEARNING_ROADMAP.md            # ⭐ 4 阶段学习路径(从入门到专家)
│   ├── SYNTAX_CHEATSHEET.md           # 一页语法速查
│   ├── SCALA2_VS_SCALA3.md            # Scala 2 vs 3 速查
│   ├── INTERVIEW_QA.md                # 60 道专家级面试题
│   ├── BEST_PRACTICES.md              # 风格指南与反模式
│   ├── modules/                       # 26 个学习模块
│   │   ├── 00_expressiveness/  ~  16_diff/  (原始 16 模块)
│   │   ├── M00_EXPRESSIVENESS.md      # 30 分钟体验 Scala
│   │   ├── M01_DEEP.md ~ M15_DEEP.md  # 原 M01-M15 深度补充
│   │   ├── M17_COLLECTIONS.md         # 集合库深度
│   │   ├── M18_FUNCTIONAL_PATTERNS.md # FP 模式
│   │   ├── M19_CONCURRENCY_DEEP.md    # 并发深度(cats-effect)
│   │   ├── M20_TYPE_LEVEL.md          # 类型级编程
│   │   ├── M21_PERFORMANCE.md         # 性能与 JVM 互操作
│   │   ├── M22_ECOSYSTEM.md           # 生态选型
│   │   ├── M23_TESTING.md             # 测试策略
│   │   ├── M24_BUILD_TOOLS.md         # 构建工具
│   │   ├── M25_PROJECT_BANKING.md     # 银行项目(实战)
│   │   └── M26_PROJECT_STREAMING.md   # 流处理项目(实战)
├── modules-v2/                        # Scala 2.13 子项目
│   └── src/{main,test}/scala/.../m00_expressiveness ~ m20_type_level/
├── modules-v3/                        # Scala 3.3+ 子项目
│   └── src/{main,test}/scala/.../m00_expressiveness ~ m20_type_level/
├── examples/                          # 综合示例
└── README.md
```

## 学习路径

**🌟 强烈建议先读 [docs/LEARNING_ROADMAP.md](docs/LEARNING_ROADMAP.md) 再开始。**

按阶段阅读:

### Phase 1 —— 基础(30-50 小时)
- [M00 表达力之旅](docs/modules/M00_EXPRESSIVENESS.md)
- [M01 基础类型深度](docs/modules/M01_DEEP.md) + [M01 基础类型](docs/modules/01_basics.md)
- [M02 函数深度](docs/modules/M02_DEEP.md) + [M02 函数](docs/modules/02_functions.md)
- [M03 类与特质深度](docs/modules/M03_DEEP.md) + [M03 类与特质](docs/modules/03_classes_traits.md)
- [M04 ADT 深度](docs/modules/M04_DEEP.md) + [M04 ADT](docs/modules/04_sealed_adts.md)
- [M07 模式匹配深度](docs/modules/M07_DEEP.md) + [M07 模式匹配](docs/modules/07_pattern_matching.md)
- [M08 高阶函数](docs/modules/08_hof_sam.md)
- [M11 for 推导深度](docs/modules/M11_DEEP.md) + [M11 for 推导](docs/modules/11_for_collections.md)
- [M12 错误处理深度](docs/modules/M12_DEEP.md) + [M12 错误处理](docs/modules/12_error_handling.md)
- [M13 并发基础深度](docs/modules/M13_DEEP.md) + [M13 并发](docs/modules/13_concurrency.md)
- [M16 同题对比](docs/modules/16_diff.md)

### Phase 2 —— 中级(60-100 小时)
- [M05 类型类深度](docs/modules/M05_DEEP.md) + [M05 类型类](docs/modules/05_typeclasses.md)
- [M06 泛型深度](docs/modules/M06_DEEP.md) + [M06 泛型](docs/modules/06_generics.md)
- [M09 扩展方法](docs/modules/09_extensions.md)
- [M10 操作符](docs/modules/10_operators.md)
- [M14 内联与宏深度](docs/modules/M14_DEEP.md) + [M14 元编程](docs/modules/14_macros_meta.md)
- [M15 高级类型深度](docs/modules/M15_DEEP.md) + [M15 高级类型](docs/modules/15_advanced_types.md)
- [M17 集合深度](docs/modules/M17_COLLECTIONS.md)
- [M18 函数式模式](docs/modules/M18_FUNCTIONAL_PATTERNS.md)
- [M23 测试策略](docs/modules/M23_TESTING.md)

### Phase 3 —— 高级(80-150 小时)
- [M19 并发深度(cats-effect)](docs/modules/M19_CONCURRENCY_DEEP.md)
- [M20 类型级编程](docs/modules/M20_TYPE_LEVEL.md)
- [M21 性能与 JVM 互操作](docs/modules/M21_PERFORMANCE.md)
- [M22 生态选型](docs/modules/M22_ECOSYSTEM.md)
- [M24 构建工具](docs/modules/M24_BUILD_TOOLS.md)
- [M25 银行项目](docs/modules/M25_PROJECT_BANKING.md)
- [M26 流处理项目](docs/modules/M26_PROJECT_STREAMING.md)

### Phase 4 —— 专家
- [INTERVIEW_QA 60 道专家级面试题](docs/INTERVIEW_QA.md)
- [BEST_PRACTICES 风格指南](docs/BEST_PRACTICES.md)
- 阅读 cats / fs2 / http4s 源码
- 提交 Scala 开源 PR

## 运行代码

```bash
# Scala 2.13 子项目
sbt "modulesV2/Test/compile"
sbt "modulesV2/Test/test"

# Scala 3.3+ 子项目
sbt "modulesV3/Test/compile"
sbt "modulesV3/Test/test"

# 一次性全部编译与测试
sbt +Test/compile
sbt +Test/test
```

> **注意**:本仓库不开 sbt。你需要先安装 [sbt 1.9+](https://www.scala-sbt.org/) 与 JDK 11+。
> sbt 不可用时,可使用 [scala-cli](https://scala-cli.virtuslab.org/) 运行单个文件。

## 涵盖内容(对照 ¥50K 能力清单)

| 能力 | 本教程章节 |
|------|-----------|
| 写出 case class / for / Option | M01-M04, M11 |
| 解释 implicit 解析 | M05 |
| 写自定义类型类 | M05, M18 |
| 区分 cats / scalaz 风格 | M18, M22 |
| 用 cats-effect / fs2 | M19, M26 |
| 写出无 boxing 的 hot path | M21 |
| 用 Scala 3 inline 元编程 | M14 |
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

## 与 sbt 版本

| 工具 | 版本 |
|------|------|
| sbt | 1.9.x |
| Scala 2 | 2.13.12 |
| Scala 3 | 3.3.3 |
| ScalaTest | 3.2.17 |

## 代码质量原则

- **不可变性优先**:`val` 优先,仅在性能敏感点用 `var`
- **类型显式**:公共 API 标注返回类型
- **文档注释**:所有公开符号使用 Scaladoc
- **零警告**:开 `-Werror`,`-Wconf cat=unused:info` 静默 unused
- **命名清晰**:类型类用 `TypeClass` 后缀,实例用 `given TypeClass`
- **测试覆盖**:每模块有完整测试,Happy path + 边界 + 失败

## 推荐阅读顺序

1. 📖 读 [LEARNING_ROADMAP.md](docs/LEARNING_ROADMAP.md) —— 了解整体路径
2. 🏃 跑通 `sbt +Test/test` —— 确认环境
3. 🚀 从 [M00](docs/modules/M00_EXPRESSIVENESS.md) 开始,按 Phase 1 → 4 顺序
4. 💻 每个模块跑对应的 `modules-v2` / `modules-v3` 测试
5. 🛠️ 完成 M25 / M26 实战项目
6. 🎯 模拟 [INTERVIEW_QA](docs/INTERVIEW_QA.md) 自我测试

加油!学完你就不是"会 Scala 的人"了,你是"能把 Scala 用到极致的工程师"。
