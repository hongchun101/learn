# Cangjie 高级语法学习项目

本项目系统性地演示仓颉（Cangjie）编程语言的全部高级语法特性。代码组织成 15 个模块，每个模块专注于一组相关特性，配有完整注释与可运行示例。

## 项目结构

```
cangjie-learning/
├── src/
│   ├── main.cj                       # 项目入口，按序执行所有演示
│   ├── 01_basics/                    # 基础语法
│   ├── 02_functions/                 # 函数与闭包
│   ├── 03_structs_classes/           # 结构体与类
│   ├── 04_enums/                     # 枚举（代数数据类型）
│   ├── 05_interfaces_traits/         # 接口与特征
│   ├── 06_generics/                  # 泛型
│   ├── 07_pattern_matching/          # 模式匹配
│   ├── 08_lambdas/                   # Lambda 与高阶函数
│   ├── 09_extensions/                # 扩展函数
│   ├── 10_operator_overloading/      # 操作符重载
│   ├── 11_error_handling/            # 错误处理
│   ├── 12_concurrency/               # 并发编程
│   ├── 13_macros/                    # 宏
│   ├── 14_advanced_types/            # 类型别名与高级类型
│   └── 15_collection_ops/            # 集合操作
├── docs/                             # 详细文档
├── examples/                         # 综合示例
├── tests/                            # 单元测试
└── cjpm.toml                         # 包管理配置
```

## 运行

```bash
# 使用 cjpm（Cangjie Package Manager）
cjpm run

# 或直接编译运行
cjc src/main.cj
./main
```

## 涵盖的语法特性

| 模块 | 特性 |
|------|------|
| 01_basics | 变量声明（`let`/`var`）、基础类型、控制流、`Unit`/`Nothing` |
| 02_functions | 默认参数、命名参数、可变参数、嵌套函数、Lambda |
| 03_structs_classes | `struct`/`class`、构造函数、`init`、`mut`、访问控制 |
| 04_enums | 简单枚举、带负载枚举、`Option`/`Result` 风格 ADT |
| 05_interfaces_traits | 多接口实现、默认实现、`extend` 扩展 |
| 06_generics | 泛型函数、泛型类型、上界约束、`<:` |
| 07_pattern_matching | 常量/类型/枚举/嵌套模式、守卫 |
| 08_lambdas | 高阶函数、柯里化、函数引用 |
| 09_extensions | `extend` 关键字扩展已有类型 |
| 10_operator_overloading | 运算符重载（`+`、`==`、索引等） |
| 11_error_handling | `try`/`catch`、`Option`、`Result` |
| 12_concurrency | `spawn`、线程同步、原子操作 |
| 13_macros | 宏定义、`quote`/`unquote` |
| 14_advanced_types | 类型别名、`type` 投影 |
| 15_collection_ops | `Array`、`List`、`Map`、流式操作 |

## 代码质量原则

- **不可变性优先**：默认使用 `let`，需要时再 `var`
- **类型显式**：公共 API 显式标注类型，私有实现可省略
- **文档注释**：所有公开符号附带 `///` 文档
- **单一职责**：每个类型专注一个领域概念
- **命名清晰**：使用领域术语，避免缩写