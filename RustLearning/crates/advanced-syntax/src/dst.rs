//! Dynamically sized types (DSTs), unsized coercion, `?Sized`.
//!
//! A trait object `dyn Trait` is a DST because its size depends on the
//! concrete type behind it. A `str` is a DST because its size depends on
//! length.
//!
//! Generic bounds default to `T: Sized`. Adding `?Sized` allows the bound
//! to also accept unsized types.

use std::fmt::Debug;

/// A function that takes any `Debug` type, sized or not.
pub fn describe<T: Debug + ?Sized>(value: &T) -> String {
    format!("{value:?}")
}

/// Sum the "size hint" of any iterator, used to assert that unsized
/// iterators round-trip through trait objects.
pub fn collect_len(iter: Box<dyn Iterator<Item = u32>>) -> u32 {
    iter.count() as u32
}

/// A tiny DST carrier: data is appended to a `Box<dyn Any>` when the trait
/// object captures concrete behavior. This pattern is the basis for
/// type-erased stores like `AnyMap`.
pub fn store_dyn() -> Box<dyn std::any::Any> {
    Box::new(42u32)
}

/// `?Sized` and unsized references: `&str`, `&[T]`, `&dyn Trait` are all
/// unsized references (`&` to a DST). This function exercises each.
pub fn accept_unsized(s: &str, sl: &[i32], t: &(dyn Debug + Send)) -> String {
    let _ = (s, sl);
    format!("{t:?}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn question_sized_works() {
        // Sized:
        assert_eq!(describe(&42), "42");
        // Unsized (str):
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
        // The fmt::Debug is dyn-compatible; we use `&[1, 2, 3]` for the slice.
        let s = accept_unsized(
            "x",
            &[1, 2, 3],
            &"a debuggable dyn",
        );
        assert!(s.contains("debuggable"));
    }
}
