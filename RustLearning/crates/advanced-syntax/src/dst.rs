//! 动态大小类型（DST）、未固定大小强制转换、`?Sized`。
//!
//! trait 对象 `dyn Trait` 是一种 DST，因为其大小取决于其背后的具体类型。
//! `str` 也是一种 DST，因为它的大小取决于长度。
//!
//! 泛型约束默认是 `T: Sized`。加上 `?Sized` 后，约束也可接受未固定大小类型。

use std::fmt::Debug;

/// 一个接受任意 `Debug` 类型的函数（无论是否固定大小）。
pub fn describe<T: Debug + ?Sized>(value: &T) -> String {
    format!("{value:?}")
}

/// 对任意迭代器的“长度提示”进行求和，用于断言未固定大小迭代器
/// 能够通过 trait 对象来回传递。
pub fn collect_len(iter: Box<dyn Iterator<Item = u32>>) -> u32 {
    iter.count() as u32
}

/// 一个微小的 DST 载体：当 trait 对象捕获具体行为时，数据会被附加到
/// `Box<dyn Any>` 中。这种模式是 `AnyMap` 等类型擦除存储的基础。
pub fn store_dyn() -> Box<dyn std::any::Any> {
    Box::new(42u32)
}

/// `?Sized` 与未固定大小的引用：`&str`、`&[T]`、`&dyn Trait` 都是
/// 指向 DST 的未固定大小引用。本函数对它们一一演练。
pub fn accept_unsized(s: &str, sl: &[i32], t: &(dyn Debug + Send)) -> String {
    let _ = (s, sl);
    format!("{t:?}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn question_sized_works() {
        // 固定大小：
        assert_eq!(describe(&42), "42");
        // 未固定大小（str）：
        assert_eq!(describe("hi"), "\"hi\"");
    }

    #[test]
    fn dyn_iter_collects() {
        let v: Vec<u32> = vec![1, 2, 3];
        let len = collect_len(Box::new(v.into_iter()));
        assert_eq!(len, 3);
    }

    #[test]
    fn dyn_any_round_trips() {
        let any_box = store_dyn();
        assert!(any_box.downcast_ref::<u32>().is_some());
    }

    #[test]
    fn accepts_unsized_refs() {
        // `fmt::Debug` 是 dyn 兼容的；这里对切片使用 `&[1, 2, 3]`。
        let s = accept_unsized("x", &[1, 2, 3], &"a debuggable dyn");
        assert!(s.contains("debuggable"));
    }
}
