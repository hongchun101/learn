//! Newtype, `Deref` and `AsRef` patterns.

use std::ops::Deref;

/// A newtype wrapper that owns a `String` and exposes read-only access via
/// `Deref`. `Deref` should be implemented sparingly because deref coercion
/// can trigger surprising type lookups; here we only allow it because the
/// wrapper is conceptually a `String` view.
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

/// A newtype wrapper that implements `AsRef<Path>` to integrate with the
/// standard library's filesystem APIs.
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

/// A small helper showing that `Cow<'a, str>` can be returned for callers
/// that do not require ownership.
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
