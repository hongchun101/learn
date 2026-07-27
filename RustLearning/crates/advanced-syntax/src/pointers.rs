//! newtype 模式、`Deref` 与 `AsRef` 模式。

use std::ops::Deref;

/// 一个持有 `String` 并通过 `Deref` 提供只读访问的 newtype 包装器。
/// 由于解引用强制转换可能会触发令人意外的类型查找，
/// `Deref` 的实现应当谨慎使用；这里之所以允许，
/// 是因为该包装器本质上就是 `String` 的视图。
pub struct Name(String);

impl Name {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn into_inner(self) -> String {
        self.0
    }
}

impl Deref for Name {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// 一个实现 `AsRef<Path>` 的 newtype 包装器，用于与标准库的文件系统 API 集成。
pub struct ConfigPath(String);

impl ConfigPath {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }
}

impl AsRef<std::path::Path> for ConfigPath {
    fn as_ref(&self) -> &std::path::Path {
        std::path::Path::new(&self.0)
    }
}

/// 一个小辅助函数，展示 `Cow<'a, str>` 可以被返回给不需要所有权的调用者。
pub fn trimmed(input: &str) -> std::borrow::Cow<'_, str> {
    let trimmed = input.trim();
    if trimmed.len() == input.len() {
        std::borrow::Cow::Borrowed(input)
    } else {
        std::borrow::Cow::Owned(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deref_to_str() {
        let n = Name::new("Alice");
        assert_eq!(n.len(), 5);
    }

    #[test]
    fn as_ref_to_path() {
        let cp = ConfigPath::new("/tmp/foo");
        let p: &std::path::Path = cp.as_ref();
        assert!(p.ends_with("foo"));
    }

    #[test]
    fn trimmed_cow() {
        let s: std::borrow::Cow<'_, str> = trimmed("  hi  ");
        assert_eq!(s, "hi");
        let b: std::borrow::Cow<'_, str> = trimmed("hi");
        assert!(matches!(b, std::borrow::Cow::Borrowed(_)));
    }
}
