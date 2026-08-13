//! Rust 惯用模式目录。
//!
//! 本 crate 与 `advanced-syntax` 互为补充：`advanced-syntax` 覆盖语言核心
//! 机制（生命周期、trait、宏等），`idiomatic-patterns` 聚焦**生产代码中
//! 反复出现的设计模式**。每一个模块都对应一个或多个真实工程场景，
//! 所有公共 API 都有对应的测试断言其行为。
//!
//! 涵盖模式：
//!
//! - **newtype**：为原语附加语义边界，禁止单位混用。
//! - **RAII 守卫**：作用域退出时自动释放资源（文件、锁、追踪 span）。
//! - **类型状态**：在类型系统层编码"连接建立/已建立/已关闭"。
//! - **无锁原语**：`Arc<Atomic*>` 模式、原子引用计数与发布语义。
//! - **零拷贝视图**：借用切片、用 `Cow` 在"借用 / 拥有"之间选择。
//! - **侵入式容器**：手动管理节点内存，零分配开销的链表。
//!
//! 每个模块的设计目标：能在 5 分钟内读完，并在 10 分钟内复用到自己的项目。

#![allow(clippy::module_inception)]
#![allow(unused_imports)]

pub mod intrusive;
pub mod lock_free;
pub mod newtypes;
pub mod raii_guards;
pub mod type_state;
pub mod zero_copy;
