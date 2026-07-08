//! Module organization, `pub use` re-exports, and feature flags.
//!
//! - `pub use` flattens the public surface.
//! - Inline modules vs. separate files vs. `mod foo;` declaration.
//! - Conditional compilation with `#[cfg(feature = ...)]`.

//! - `pub use` re-exports the type.

/// A private module type only used in tests.
#[derive(Debug)]
pub struct Item {
    pub id: u32,
    pub name: String,
}

/// `pub use` re-export: callers reference `crate::Item` despite the source
/// living in a submodule.
pub use self::internal::PublicSurface as ReexportedPublicSurface;

mod internal {
    /// Internal: every leaf in the toy module tree.
    #[derive(Debug)]
    pub struct PublicSurface {
        pub label: &'static str,
    }

    impl PublicSurface {
        pub fn new(label: &'static str) -> Self {
            Self { label }
        }
    }
}

/// `#[cfg(feature = "...")]` gating. The default build does not pull in
/// heavy machinery.
#[cfg(feature = "serde")]
pub fn serde_optional_call<T>(_t: &T) -> &str {
    "with-serde"
}

#[cfg(not(feature = "serde"))]
pub fn serde_optional_call<T>(_t: &T) -> &str {
    "no-serde"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pub_use_flattens_path() {
        let surf = ReexportedPublicSurface::new("ok");
        assert_eq!(surf.label, "ok");
    }

    #[test]
    fn feature_flag_default_path() {
        let v: u32 = 7;
        assert_eq!(serde_optional_call(&v), "no-serde");
    }

    #[test]
    fn item_struct_constructs() {
        let item = Item {
            id: 1,
            name: "x".into(),
        };
        assert_eq!(item.id, 1);
    }
}
