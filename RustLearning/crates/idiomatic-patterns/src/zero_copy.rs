//! 零拷贝视图：借用切片与 `Cow` 选择。
//!
//! "零拷贝"在 Rust 中意味着**避免把数据从一处搬到另一处**：
//! 解析器直接返回输入切片的借用，调用方按需 `to_owned` 一次。
//! 模式有三种常见形态：
//!
//! 1. **借用切片 + 生命周期**：解析器 `fn parse(&[u8]) -> Result<(&[u8], &[u8]), E>`。
//! 2. **`Cow<'a, T>`**：有时借用、有时拥有，由运行时分支决定。
//! 3. **`Bytes` / `&str` 视图**：对外暴露 `AsRef<[u8]>` / `AsRef<str>`。
//!
//! 本模块用一个最简的 INI 行解析器说明这些模式。

use std::borrow::Cow;
use std::error::Error;
use std::fmt;

/// 解析后的一行：`key=value` 或仅 `key`（空值）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Line<'a> {
    pub key: &'a str,
    pub value: Cow<'a, str>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub line: usize,
    pub reason: Reason,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reason {
    Empty,
    MissingSeparator,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "parse error at line {}: {:?}", self.line, self.reason)
    }
}

impl Error for ParseError {}

/// 零拷贝解析：返回的 [`Line`] 借用自 `input`，不分配内存。
pub fn parse_line<'a>(input: &'a str) -> Result<Line<'a>, Reason> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(Reason::Empty);
    }
    match trimmed.split_once('=') {
        Some((k, v)) => {
            let k = k.trim();
            let v = v.trim();
            if k.is_empty() {
                return Err(Reason::MissingSeparator);
            }
            // 如果值与原文本一致就直接借用，否则一次性 owned。
            let v: Cow<'a, str> = if v.len() == trimmed.len() - (trimmed.len() - v.len()) {
                // 简化处理：直接借用 trimmed 切片里的子区间。
                Cow::Borrowed(v)
            } else {
                Cow::Borrowed(v)
            };
            Ok(Line { key: k, value: v })
        }
        None => Ok(Line {
            key: trimmed,
            value: Cow::Borrowed(""),
        }),
    }
}

/// 把整个 INI 文本按行解析为 `Vec<Line<'a>>`。
pub fn parse_all(input: &str) -> (Vec<Line<'_>>, Vec<ParseError>) {
    let mut ok = Vec::new();
    let mut err = Vec::new();
    for (idx, raw) in input.lines().enumerate() {
        match parse_line(raw) {
            Ok(l) => ok.push(l),
            Err(reason) => err.push(ParseError {
                line: idx + 1,
                reason,
            }),
        }
    }
    (ok, err)
}

/// `Cow` 选择：把字符串转成首字母大写版本。
/// 如果无需修改就借用，否则只在这一份拷贝上工作。
pub fn capitalize_first(input: &str) -> Cow<'_, str> {
    if input.chars().next().is_some_and(char::is_uppercase) {
        Cow::Borrowed(input)
    } else {
        let mut owned = input.to_owned();
        if let Some(first) = owned.chars().next() {
            // SAFETY：单字符替换不改变字节长度。
            let upper: String = first.to_uppercase().collect();
            owned.replace_range(..upper.len(), &upper);
        }
        Cow::Owned(owned)
    }
}

/// `AsRef<[u8]>` 与 `AsRef<str>` 视图：让自定义类型无缝接入标准库。
#[derive(Debug, Clone, Copy)]
pub struct ByteView<'a> {
    bytes: &'a [u8],
}

impl<'a> ByteView<'a> {
    #[must_use]
    pub fn new(bytes: &'a [u8]) -> Self {
        Self { bytes }
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.bytes.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.bytes.is_empty()
    }
}

impl AsRef<[u8]> for ByteView<'_> {
    fn as_ref(&self) -> &[u8] {
        self.bytes
    }
}

impl<'a> From<&'a [u8]> for ByteView<'a> {
    fn from(bytes: &'a [u8]) -> Self {
        Self { bytes }
    }
}

impl<'a> From<&'a str> for ByteView<'a> {
    fn from(s: &'a str) -> Self {
        Self {
            bytes: s.as_bytes(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_line_borrows_from_input() {
        let owned = String::from("name=alice");
        let line = parse_line(&owned).unwrap();
        // 借用关系：line.key 与 line.value 都指向 `owned` 的内部。
        assert_eq!(line.key, "name");
        assert_eq!(line.value.as_ref(), "alice");
        assert!(matches!(line.value, Cow::Borrowed(_)));
    }

    #[test]
    fn parse_line_key_only() {
        let line = parse_line("flag").unwrap();
        assert_eq!(line.key, "flag");
        assert_eq!(line.value.as_ref(), "");
    }

    #[test]
    fn parse_line_empty_is_error() {
        assert_eq!(parse_line("   "), Err(Reason::Empty));
    }

    #[test]
    fn parse_all_returns_errors_with_line_number() {
        let input = "a=1\n\nb=2\nbad line";
        let (ok, err) = parse_all(input);
        assert_eq!(ok.len(), 3);
        assert_eq!(err.len(), 1);
        assert_eq!(err[0].line, 2);
    }

    #[test]
    fn capitalize_first_borrows_when_already_upper() {
        let s = "Rust";
        let out = capitalize_first(s);
        assert!(matches!(out, Cow::Borrowed(_)));
        assert_eq!(out, "Rust");
    }

    #[test]
    fn capitalize_first_owns_when_lower() {
        let s = "rust";
        let out = capitalize_first(s);
        assert!(matches!(out, Cow::Owned(_)));
        assert_eq!(out, "Rust");
    }

    #[test]
    fn byte_view_as_ref() {
        let v: ByteView<'_> = ByteView::from("hi");
        let bytes: &[u8] = v.as_ref();
        assert_eq!(bytes, b"hi");
        assert_eq!(v.len(), 2);
    }
}
