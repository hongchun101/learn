# Scala 高级语法学习项目

系统性演示 Scala 2.13 与 Scala 3.3+ 的全部高级语法特性，按 16 个主题模块组织，每个模块分别在两个 Scala 版本下实现并配测试。

## 目标

- 覆盖 Scala 2 与 Scala 3 的核心与高级语法差异
- 每一组特性都有 **可编译、可运行、有断言** 的演示代码
- 在统一目录结构中并列展示 `v2/` 与 `v3/`，便于逐行对照
- 演示代码即文档，类型签名、文档注释、不可变性优先

## 项目结构

```
scala-learning/
├── build.sbt                          # sbt 多模块聚合：modules-v2 / modules-v3
├── project/                           # sbt 插件与版本
├── docs/                              # 模块级文档与 Scala2 vs Scala3 差异总表
│   ├── SCALA2_VS_SCALA3.md
│   └── modules/                       # 16 个模块的深度讲解
├── modules-v2/                        # Scala 2.13 子项目
│   └── src/{main,test}/scala/.../m01_basics/ ... /m16_diff/
├── modules-v3/                        # Scala 3.3+ 子项目
│   └── src/{main,test}/scala/.../m01_basics/ ... /m16_diff/
├── examples/                          # 综合示例（同一题目的 v2 / v3 解法）
└── README.md
```

每个 `mXX_xxx/` 模块内部分为 `v2/` 与 `v3/` 两个子包，分别用对应版本语法实现同一抽象。

## 运行

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

`+` 前缀告诉 sbt 跨所有聚合配置分别执行。

## 涵盖的语法特性

| 模块 | 特性 | Scala 2 重点 | Scala 3 重点 |
|------|------|--------------|--------------|
| 01_basics | 值类、字面量、`AnyVal`/`AnyRef`、字符串插值 | `@specialized` | `opaque type`、`inline if` |
| 02_functions | 默认/命名参数、变参、柯里化、按名参数、依赖方法类型 | `=> A` | `using` 参数、`@targetName` |
| 03_classes_traits | 抽象类、特质线性化、自身类型、包对象 | `package object` | `export`、顶级定义 |
| 04_sealed_adts | 密封 trait、ADT、Option/Either/枚举 | Scala 2 枚举 | `enum` 关键字 |
| 05_typeclasses | 隐式解析、上下文边界、类型类推导 | `implicit` / `implicitly` | `given` / `using` / `summon` |
| 06_generics | 型变、高阶类型、约束 | `:+:` / 抽象类型 | `[F[_]]` 高阶 + `Matchable` |
| 07_pattern_matching | 提取器、模式守卫、绑定、`unapplySeq` | 密封 trait 完备性 | 多层 enum 模式 |
| 08_hof_sam | 高阶函数、SAM 转换 | `(Int) => Int` | `FunctionN` 类型族、新 SAM |
| 09_extensions | 扩展方法 | `implicit class` | `extension` / `def` |
| 10_operators | 操作符重载、Numeric、Ordering | 中缀方法 | 中缀方法 + `transparent inline` |
| 11_for_collections | for-推导、集合、流 | `Stream` | `LazyList` / `fs2` 风格 |
| 12_error_handling | `Try` / `Either` / `scala.util.control` | `Validation` | `CanThrow` + 抛异常习惯 |
| 13_concurrency | `Future` / `ExecutionContext` / 并行集合 | `Await` | `ExecutionContext` 派生 |
| 14_macros_meta | 宏注解 / quasiquotes | `scala.reflect.api` | `inline` / `transparent inline` / `summonFrom` / `compiletime` |
| 15_advanced_types | 路径依赖类型、依赖方法、类型 lambda | `({type L[a] = F[G[a]]})#L` | `[F[_]] =>> G[F]` |
| 16_diff | 同题两解——展示关键差异 | Scala 2 实现 | Scala 3 实现 |

## 代码质量原则

- **不可变性优先**：`val` 优先，仅在性能敏感点用 `var`
- **类型显式**：公共 API 标注返回类型；测试断言可省略
- **文档注释**：所有公开符号使用 Scaladoc `/** ... */`
- **零警告**：开 `-Werror` 等价于 `-Wconf cat=unused:info` 之外保持干净
- **命名清晰**：避免缩写；类型类用 `TypeClass` 后缀，实例用 `given TypeClass`

## 与 sbt 版本

| 工具 | 版本 |
|------|------|
| sbt | 1.9.x |
| Scala 2 | 2.13.12 |
| Scala 3 | 3.3.3 |
| ScalaTest | 3.2.17（2.13 & 3 通用） |

## 推荐阅读顺序

1. 跑通 `sbt +Test/test`，确认环境
2. 阅读 `docs/SCALA2_VS_SCALA3.md` 速览差异
3. 按 `m01` → `m15` 顺序阅读 `docs/modules/`
4. 最后看 `m16_diff` 与 `examples/`
