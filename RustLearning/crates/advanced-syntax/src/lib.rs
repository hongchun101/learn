//! Rust 高级语法示例。
//!
//! 本模块中的每个子模块都包含与该特性对应的、可运行且经过类型检查的示例代码。
//! 与每个模块一同编写的测试用于断言可观察行为，确保文档的可信度。
//!
//! 涵盖的特性包括：
//!
//! - 所有权、借用、生命周期省略规则。
//! - 泛型关联类型（GATs）与高阶 trait 约束（HRTBs）。
//! - trait 对象（`dyn`）与 `impl Trait` 的对比；对象安全、覆盖式 impl。
//! - 闭包与三种闭包 trait。
//! - 带标签枚举、穷尽匹配、守卫、范围、切片模式。
//! - newtype 模式、`Deref`、`AsRef` 模式。
//! - 自定义迭代器。
//! - 使用 `thiserror` 进行错误建模。
//! - 幽灵类型、零大小类型、类型状态构建器模式。
//! - 常量泛型与 `const fn` 求值。
//! - 声明式宏与过程宏。
//! - `unsafe` 基础构件：裸指针、`MaybeUninit`、手工 `Drop`。
//! - 异步基础：`Pin`、`Future`、`Waker`、手写轮询的 Future。
//! - DST 与未固定大小强制转换。
//! - 模块组织、特性开关、`pub use` 重导出。

#![allow(clippy::module_inception)]
#![allow(unused_imports)]

pub mod closures;
pub mod const_generics;
pub mod dst;
pub mod errors;
pub mod futures_intro;
pub mod gats_hrtb;
pub mod iterators;
pub mod lifetimes;
pub mod macros_demo;
pub mod matching;
pub mod modules_organization;
pub mod patterns_type_state;
pub mod pointers;
pub mod smart_pointers;
pub mod traits_advanced;
pub mod unsafe_primitives;
