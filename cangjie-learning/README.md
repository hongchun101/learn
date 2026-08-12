# 仓颉（Cangjie）高级工程师教程

> **目标**：从零基础到仓颉语言专家，可承担服务端 / 工具链 / 鸿蒙生态开发，对标 50K 月薪岗位能力要求。
> **约定**：所有代码均通过 Cangjie 1.2.0-alpha 实测可编译运行。

## 项目亮点

- ✅ **20 个完整模块**：覆盖基础类型、ADT、模式匹配、并发、宏、标准库深度使用
- ✅ **可运行可验证**：`cjpm build` 零警告通过；`cjpm run` 完整执行 20 个模块
- ✅ **系统化文档**：4 份长文（`docs/cangjie_tutorial.md` 23KB、`best_practices.md` 11KB、`stdlib_reference.md` 10KB、`interview_prep.md` 14KB）
- ✅ **工程实例**：`examples/task_manager.cj` 完整业务系统演示

## 快速开始

```bash
# 编译并运行所有演示
cjpm build
cjpm run

# 清理
cjpm clean
```

预期看到 20 个 `[NN]` 标题的模块依次执行，最后打印 `全部演示完成`。

## 项目结构

```
cangjie-learning/
├── src/                                 # 20 个语法/标准库演示模块
│   ├── 01_basics/                       # 基础类型与控制流
│   ├── 02_functions/                    # 函数、闭包、命名参数
│   ├── 03_structs_classes/              # struct / class / 抽象类 / 单例
│   ├── 04_enums/                        # ADT、Option、Result
│   ├── 05_interfaces_traits/            # 接口、多实现、扩展
│   ├── 06_generics/                     # 泛型、约束、容器
│   ├── 07_pattern_matching/             # 模式匹配深度
│   ├── 08_lambdas/                      # Lambda、柯里化、记忆化
│   ├── 09_extensions/                   # extend 给类型加方法
│   ├── 10_operator_overloading/         # 操作符重载与 DSL
│   ├── 11_error_handling/               # 异常、Option、Result
│   ├── 12_concurrency/                  # spawn、Future、Channel、Mutex
│   ├── 13_macros/                       # 宏、@Deprecated、@When、const 函数
│   ├── 14_advanced_types/               # 类型别名、流畅接口
│   ├── 15_collection_ops/               # 集合操作
│   ├── 16_io_filesystem/                # 文件系统
│   ├── 17_regex_string/                 # 正则与字符串
│   ├── 18_time_datetime/                # 时间与日期
│   ├── 19_advanced_concurrency/         # 高级并发：Channel、并行 Map/Reduce
│   ├── 20_reflection_macros/            # 编译期编程、注解、JSON 框架
│   └── main.cj                          # 入口，按序执行所有演示
│
├── docs/                                # 系统化文档（建议按顺序阅读）
│   ├── cangjie_tutorial.md              # 📘 权威教程（必读）
│   ├── best_practices.md                # 📙 最佳实践与反模式
│   ├── stdlib_reference.md              # 📕 标准库速查
│   └── interview_prep.md                # 📗 50K 面试指南
│
├── examples/                            # 完整业务实例
│   └── task_manager.cj                  # 任务管理器：枚举 + 仓储 + 业务服务
│
├── tests/                               # 单元测试（待补充）
│   └── basics_test.cj
│
├── cjpm.toml                            # 包配置
└── README.md                            # 本文件
```

## 学习路径（推荐）

### 第 1 周：基础（每日 2-3 小时）

1. 跑通 `cjpm run`，观察每个模块输出
2. 阅读 [`docs/cangjie_tutorial.md`](docs/cangjie_tutorial.md) 第 1-4 章
3. 修改 `src/01_basics/basics.cj` 中的示例，加深理解

### 第 2 周：核心特性

1. 阅读 `cangjie_tutorial.md` 第 5-10 章
2. 重点理解：枚举 + 模式匹配 + 扩展 + 运算符重载
3. 阅读 [`examples/task_manager.cj`](examples/task_manager.cj)，尝试添加功能

### 第 3 周：进阶

1. 阅读 `cangjie_tutorial.md` 第 11-15 章
2. 学习并发模型（章节 13）、宏（章节 14）
3. 阅读 [`docs/best_practices.md`](docs/best_practices.md)，重构自己的代码

### 第 4 周：标准库与实战

1. 阅读 [`docs/stdlib_reference.md`](docs/stdlib_reference.md)
2. 实现 1-2 个完整 demo：HTTP 客户端 / 任务调度器 / 简易 ORM
3. 用 `cjpm test` 验证功能

### 第 5 周：面试准备

1. 阅读 [`docs/interview_prep.md`](docs/interview_prep.md)
2. 背诵高频 50 题
3. 准备 STAR 故事
4. 模拟面试

## 文档导航

| 文档 | 何时读 |
|------|--------|
| [`docs/cangjie_tutorial.md`](docs/cangjie_tutorial.md) | **第一次**：系统学习；**后续**：查阅具体特性 |
| [`docs/best_practices.md`](docs/best_practices.md) | 写代码前：避免反模式；code review 时 |
| [`docs/stdlib_reference.md`](docs/stdlib_reference.md) | 实际开发：API 不确定时查 |
| [`docs/interview_prep.md`](docs/interview_prep.md) | 求职前：背诵高频题、准备 STAR |

## 代码模块速览

### 基础层（[M1]-[M5]）

- **`01_basics/`**：变量、类型、控制流、字符串模板
- **`02_functions/`**：默认参数、命名参数、闭包、嵌套函数
- **`03_structs_classes/`**：值类型 vs 引用类型、抽象类、单例
- **`04_enums/`**：ADT、Option、Result 风格、业务状态机
- **`05_interfaces_traits/`**：接口、多实现、扩展

### 中阶层（[M6]-[M10]）

- **`06_generics/`**：泛型函数、容器、约束、链表
- **`07_pattern_matching/`**：字面量、守卫、解构、嵌套
- **`08_lambdas/`**：Lambda、组合、柯里化、记忆化
- **`09_extensions/`**：给标准库和自定义类型扩展
- **`10_operator_overloading/`**：复数、向量、区间、Money

### 高级层（[M11]-[M15]）

- **`11_error_handling/`**：try/catch、Result、defer
- **`12_concurrency/`**：spawn、Future、Channel、Mutex
- **`13_macros/`**：宏展开、注解、const 函数
- **`14_advanced_types/`**：类型别名、Self 返回类型
- **`15_collection_ops/`**：map、filter、reduce、distinct、sorted

### 标准库（[M16]-[M18]）

- **`16_io_filesystem/`**：File、Directory、Path
- **`17_regex_string/`**：正则匹配、字符串构造、Unicode
- **`18_time_datetime/`**：DateTime、Duration、测量耗时

### 工程实践（[M19]-[M20]）

- **`19_advanced_concurrency/`**：有界 Channel、互斥计数器、并行 Map/Reduce
- **`20_reflection_macros/`**：编译期校验、JSON 序列化、路由注册表

## 完整业务示例

[`examples/task_manager.cj`](examples/task_manager.cj) 演示：

- 用 enum 建模任务状态机（Todo / InProgress / InReview / Done / Archived）
- 通用泛型仓储 `Repository<T, ID>`
- 业务服务组合仓储 + 业务规则
- 高阶函数 `filter / sortedBy` 处理集合
- 综合应用：创建、分配、更新进度、搜索、按优先级排序

## 已验证能力

- ✅ `cjpm build` 零错误零警告通过
- ✅ `cjpm run` 完整执行 20 个模块
- ✅ 所有代码在 Cangjie 1.2.0-alpha 编译器上验证
- ✅ 涵盖语言核心 + 标准库 + 并发 + 宏

## 适用读者

- 有 **静态类型语言基础**（Rust / Swift / Kotlin / TypeScript）
- 想系统学习 **仓颉** 用于鸿蒙生态 / 服务端 / 工具链开发
- 目标 **30K-50K+ 月薪** 的工程师
- 准备 **仓颉 / 鸿蒙岗位面试**

## 贡献

欢迎：
- 修复文档错误
- 增加更多 demo 模块
- 完善测试覆盖
- 补充面试题与解析

## 参考

- [仓颉官方文档](https://cangjie-lang.cn/)
- [仓颉 GitHub](https://github.com/cangjie-lang/cangjie)
- [鸿蒙开发者](https://developer.huawei.com/)
