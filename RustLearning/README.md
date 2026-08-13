# RustLearning — 通往 Rust 专家的练习场

> 目标：完成本仓库全部 200+ 测试后，**具备承担 50K 级别 Rust 后端 / 系统 / 嵌入式岗位面试与日常工作所需的语言与工程能力**。

本项目是一个 Cargo workspace：每一个 crate 覆盖 Rust 的一个能力维度，
每个模块都附带**可运行 + 有断言的测试**。建议按下面的"学习路径"逐个
读完，再写一段自己的练习代码。

## 学习路径（推荐顺序）

| 阶段 | 目标 | Crate | 关键技能点 |
| --- | --- | --- | --- |
| 1 | 掌握类型系统 + 宏 + 异步基础 | `advanced-syntax` | 生命周期、GAT、HRTB、trait 对象、`async fn`、`unsafe` 基础 |
| 2 | 把语言机制转成生产模式 | `idiomatic-patterns` | newtype、RAII、类型状态、原子、零拷贝、侵入式容器 |
| 3 | 与 C / 操作系统对话 | `ffi-bridge` | `extern "C"` ABI、`repr(C)`、回调、不透明句柄 |
| 4 | 解析真实协议 | `parser-demo` | winnow 组合子、零拷贝、`ParseError` |
| 5 | 把 Future 跑起来 | `runtime` | 手写执行器、`Waker`、`Pin`、自引用 future |

> 工作 50K 级别 Rust 岗位所需的"半壁江山"是**生态**（tokio / axum / sqlx / tracing / serde / clap / anyhow / config）。本仓库专注**语言 + 模式**；生态部分请结合 [`tokio-rs/tracing`](https://github.com/tokio-rs/tracing) 等官方文档扩展。

## Crates

| Crate | 主题 |
| --- | --- |
| `advanced-syntax` | 全套高级语言特性：生命周期、trait、宏、`unsafe`、GAT、async、错误模型。 |
| `idiomatic-patterns` | 模式：类型状态构建器、RAII 守卫、lock-free 容器、零拷贝解析、newtype、侵入式容器。 |
| `ffi-bridge` | `extern "C"` ABI、`#[no_mangle]`、`repr(C)`、回调处理器；提供同步的 C 头文件。 |
| `parser-demo` | 基于 `winnow` 的流式解析器，演示组合子、零拷贝切片与错误位置。 |
| `runtime` | 手写极简执行器 + `Waker` 练习场，揭示 `Pin` / `Future` / 轮询的本质。 |

## 编译与验证

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo doc --workspace --no-deps
```

仓库已经通过以上全部检查，CI 友好。

## Layout

```
crates/
  advanced-syntax/      # 每个特性一个模块，公共 + 测试齐全
  idiomatic-patterns/   # 模式目录 + 单元测试
  ffi-bridge/           # C ABI 边界 + include/ffi_bridge.h
  parser-demo/          # winnow 解析器
  runtime/              # 手写执行器 + Waker 练习场
```

## 关键设计取舍

- **unsafe**：workspace `unsafe_code = "deny"`，但 `unsafe_primitives` / `intrusive` / `ffi-bridge` / `parser-demo` / `runtime` 因自身主题需要 `unsafe`，在 crate 头显式 `#![allow(unsafe_code)]`，并配 `# Safety` 注释。
- **clippy**：`pedantic` 级别 + `-D warnings`；为了讲解代码可读，**教学 crate** 局部关闭了若干 pedantic lint。每个关闭项都附有原因注释。
- **MSRV**：1.80（涵盖 `LazyLock`、稳定 `BTreeMap::extract_if` 等）。
- **依赖**：仅 `thiserror`、`anyhow`、`syn`、`quote`、`proc-macro2`、`winnow`；不引入 tokio / axum 等大依赖，保持教学聚焦。

## 与"成为 Rust 专家"的对应关系

| 50K 岗位面试常考点 | 仓库对应位置 |
| --- | --- |
| 生命周期省略与子类型 | `advanced-syntax::lifetimes` |
| GAT / HRTB | `advanced-syntax::gats_hrtb` |
| 闭包三种 trait 的捕获语义 | `advanced-syntax::closures` |
| trait 对象安全 + 封闭 trait | `advanced-syntax::traits_advanced` |
| 类型状态 / 幽灵类型 / 零大小 | `advanced-syntax::patterns_type_state`, `idiomatic-patterns::type_state` |
| 自定义迭代器 + 适配器 | `advanced-syntax::iterators` |
| 错误分层（`thiserror` + `anyhow`） | `advanced-syntax::errors` |
| 常量泛型与 `const fn` | `advanced-syntax::const_generics` |
| 宏（`macro_rules!` 与 proc-macro 入口） | `advanced-syntax::macros_demo` |
| `unsafe` 的 5 个合法用途 | `advanced-syntax::unsafe_primitives` |
| `Pin` / `Future` / 手动 poll | `advanced-syntax::futures_intro`, `runtime` |
| DST / `?Sized` / `dyn` | `advanced-syntax::dst` |
| newtype / RAII / 作用域退出 | `idiomatic-patterns::newtypes`, `idiomatic-patterns::raii_guards` |
| 无锁原语 / release-acquire | `idiomatic-patterns::lock_free` |
| 零拷贝解析 | `idiomatic-patterns::zero_copy`, `parser-demo` |
| 侵入式容器 | `idiomatic-patterns::intrusive`, `advanced-syntax::unsafe_primitives` |
| C ABI / `repr(C)` / 回调 | `ffi-bridge` |

## 下一步（外部资源）

完成本仓库后，建议按以下顺序深入生态（每一个都建议读源代码而不是文档）：

1. `serde` —— 序列化框架。读 `serde_derive` 入口，再看 `serde::Deserialize` 如何为不同类型生成实现。
2. `tokio` —— 异步运行时。读 `tokio/src/runtime/builder.rs` 与 `tokio/src/sync/mpsc.rs`。
3. `axum` —— Web 框架。看 `axum/src/extract.rs` 了解 extractor 模式，看 `tower` 了解中间件。
4. `tracing` —— 结构化日志与 span。理解 `Span::enter` 与 `Id` 树。
5. `sqlx` —— 编译期 SQL 校验 + 异步驱动。
6. `bevy` / `embedded-hal` —— 不同方向的延伸。

## 贡献指南

- 修改任何模块的 public API 都要 **同时** 增加/调整测试。
- 严格 `cargo fmt` + `cargo clippy -- -D warnings`。
- 教学代码优先可读性，但不要放弃正确性；如果发现示例有 bug，欢迎提 PR。
