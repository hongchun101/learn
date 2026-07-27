//! 模块组织、`pub use` 重导出与特性标志。
//!
//! - `pub use` 用于扁平化公共接口。
//! - 内联模块 vs. 单独文件 vs. `mod foo;` 声明。
//! - 使用 `#[cfg(feature = ...)]` 进行条件编译。

//! - `pub use` 重导出类型。

/// 仅在测试中使用的私有模块类型。
#[derive(Debug)]
pub struct Item {
    pub id: u32,
    pub name: String,
}

/// `pub use` 重导出：尽管源类型位于子模块中，
/// 调用者可以通过 `crate::ReexportedPublicSurface` 引用它。
pub use self::internal::PublicSurface as ReexportedPublicSurface;

mod internal {
    /// 内部：玩具模块树中的每个叶子。
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

/// `#[cfg(feature = "...")]` 开关。默认构建不会引入重量级机制。
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
