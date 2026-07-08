//! Advanced Rust syntax showcase.
//!
//! Every module here contains runnable, type-checked examples of the feature
//! in its name. Tests co-located with each module assert observable behavior
//! so the documentation can be trusted.
//!
//! Features covered:
//!
//! - Ownership, borrowing, lifetime elision rules.
//! - Generic associated types (GATs) and higher-ranked trait bounds (HRTBs).
//! - Trait objects (`dyn`) vs. `impl Trait`; object-safety, blanket impls.
//! - Closures and the three closure traits.
//! - Tagged enums, exhaustive matching, guards, ranges, slice patterns.
//! - Newtype, `Deref`, `AsRef` patterns.
//! - Custom iterators.
//! - Error modeling with `thiserror`.
//! - Phantom types, zero-sized types, the type-state builder pattern.
//! - Const generics and `const fn` evaluation.
//! - Declarative and procedural macros.
//! - `unsafe` building blocks: raw pointers, `MaybeUninit`, manual `Drop`.
//! - Async foundations: `Pin`, `Future`, `Waker`, hand-polled futures.
//! - DSTs and unsized coercion.
//! - Module organization, feature flags, `pub use` re-export.

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
