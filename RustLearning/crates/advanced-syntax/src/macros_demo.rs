//! 声明式宏与过程宏。
//!
//! 声明式宏（`macro_rules!`）作用于 token tree。
//! 过程宏是在编译期消费并产出 token stream 的函数；
//! 完整的 `#[proc_macro_derive]` 需要单独的 `proc-macro` crate，
//! 因此入口点函数与其测试一同放在本文件中。

pub mod proc_macro_derive_demo {
    //! 派生宏的引用主体。本身不能编译为 `proc-macro` crate，
    //! 但镜像展示了此类 crate 入口点的样子。
    use proc_macro2::TokenStream;
    use quote::quote;
    use syn::DeriveInput;

    pub fn derive_kind(input: TokenStream) -> TokenStream {
        let parsed: DeriveInput = syn::parse2(input).expect("derive input");
        let name = parsed.ident;
        let expanded = quote! {
            impl #name {
                pub fn kind() -> &'static str {
                    stringify!(#name)
                }
            }
        };
        expanded
    }
}

/// 从一个由逗号分隔的列表构建 `Vec<T>`，允许末尾的逗号。
#[macro_export]
#[allow(clippy::vec_init_then_push)]
macro_rules! vec_of {
    () => {
        ::std::vec::Vec::new()
    };
    ($($item:expr),+ $(,)?) => {{
        ::std::vec![$($item),+]
    }};
}

pub mod count_helper {
    #[macro_export]
    macro_rules! __count {
        () => { 0usize };
        ($head:expr $(, $tail:expr)*) => {
            1usize + crate::__count!($($tail),*)
        };
    }
    pub use crate::__count as count;
}

/// `kv!` 将键/值对包装为元组，并将键字符串化。
#[macro_export]
macro_rules! kv {
    ($key:ident = $val:expr) => {
        (stringify!($key), $val)
    };
}

/// 小型模式匹配宏：`try_match!(e, 2 => 5)` 在 `e == 2` 时返回 `Some(5)`，否则返回 `None`。
#[macro_export]
macro_rules! try_match {
    ($e:expr, $pat:literal => $body:expr) => {
        match $e {
            $pat => Some($body),
            _ => None,
        }
    };
}

#[cfg(test)]
mod tests {
    #[test]
    fn vec_of_collects_items() {
        let v: Vec<i32> = vec_of![1, 2, 3];
        assert_eq!(v, vec![1, 2, 3]);
    }

    #[test]
    fn vec_of_tolerates_trailing_comma() {
        let v: Vec<i32> = vec_of![1, 2, 3,];
        assert_eq!(v, vec![1, 2, 3]);
    }

    #[test]
    fn kv_pair_expansion() {
        let pair = kv!(answer = 42);
        assert_eq!(pair, ("answer", 42));
    }

    #[test]
    fn try_match_runs_branch() {
        let r: Option<i32> = try_match!(2, 2 => 2 + 3);
        assert_eq!(r, Some(5));
        assert_eq!(try_match!(1, 2 => 99), None);
    }

    #[test]
    fn derive_demo_builds_tokens() {
        use proc_macro2::TokenStream;
        let input: TokenStream = "struct Foo {}".parse().unwrap();
        let tokens = crate::macros_demo::proc_macro_derive_demo::derive_kind(input);
        let s = tokens.to_string();
        assert!(s.contains("impl"));
        assert!(s.contains("Foo"));
    }
}
