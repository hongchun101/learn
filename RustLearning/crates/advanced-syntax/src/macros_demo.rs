//! Declarative and procedural macros.
//!
//! Declarative macros (`macro_rules!`) operate on token trees. Procedural
//! macros are functions that consume and emit token streams at compile time;
//! full `#[proc_macro_derive]` requires a separate `proc-macro` crate, so
//! the entry-point function lives here next to its tests.

pub mod proc_macro_derive_demo {
    //! Reference body for a derive macro. Doesn't compile to a `proc-macro`
    //! crate, but mirrors what such a crate's entry point looks like.
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

/// Build a `Vec<T>` from a comma-separated list, tolerating a trailing comma.
#[macro_export]
macro_rules! vec_of {
    () => {
        ::std::vec::Vec::new()
    };
    ($($item:expr),+ $(,)?) => {{
        let mut v = ::std::vec::Vec::new();
        $(v.push($item);)+
        v
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

/// `kv!` wraps key/value pairs into a tuple, stringifying the key.
#[macro_export]
macro_rules! kv {
    ($key:ident = $val:expr) => {
        (stringify!($key), $val)
    };
}

/// Tiny pattern-matching macro: `try_match!(e, 2 => 5)` returns `Some(5)` if
/// `e == 2`, otherwise `None`.
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
