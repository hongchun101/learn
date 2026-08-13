//! 基于 `winnow` 的流式解析器示例。
//!
//! 目标：在不分配（zero-copy）的前提下，把一个简化的 HTTP 头块解析为
//! 强类型结构体 [`Header`] 列表。整套代码不超过 200 行。
//!
//! 关键概念：
//!
//! - `Parser` trait：所有 winnow 解析器都实现它。
//! - `&str` 的零拷贝子切片：`take_while` / `literal` 等组合子返回 `&str` 借用。
//!
//! 与手写状态机解析器相比：
//!
//! - 组合子把"重复做的事"抽成可复用片段。
//! - 错误信息更结构化（位置 + 期望 token）。
//! - 性能在简单场景下与手写相当，复杂场景下通常更快。
//!
//! # 例子
//!
//! ```
//! use parser_demo::parse_headers;
//! let raw = "Host: example.com\r\nUser-Agent: rust\r\n\r\nbody";
//! let (rest, headers) = parse_headers(raw).unwrap();
//! assert_eq!(rest, "body");
//! assert_eq!(headers.len(), 2);
//! assert_eq!(headers[0].name, "Host");
//! assert_eq!(headers[0].value, "example.com");
//! ```
//!
//! 测试中需要 unsafe 块以验证零拷贝：指针算术。
#![allow(unsafe_code)]

use winnow::ascii::line_ending;
use winnow::combinator::opt;
use winnow::error::{ContextError, ErrMode};
use winnow::token::{literal, take_while};
use winnow::{ModalResult, Parser};

/// 单个 header 字段。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Header<'a> {
    pub name: &'a str,
    pub value: &'a str,
}

/// 简化错误：包装 winnow 的 `ContextError` 并保存失败字节偏移。
#[derive(Debug)]
pub struct ParseError {
    pub position: usize,
    pub inner: ContextError,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "parse error at byte {}: {:?}", self.position, self.inner)
    }
}

impl std::error::Error for ParseError {}

/// 内部组合子统一错误类型。
type E = ErrMode<ContextError>;

// ---------------------------------------------------------------------------
// 组合子
// ---------------------------------------------------------------------------

/// header 名：字母 / 数字 / `-` / `_`。
fn header_name<'a>(input: &mut &'a str) -> ModalResult<&'a str> {
    take_while(1.., |c: char| {
        c.is_ascii_alphanumeric() || c == '-' || c == '_'
    })
    .parse_next(input)
}

/// 冒号 + 可选空白。
fn colon_space(input: &mut &str) -> ModalResult<()> {
    literal(':').parse_next(input)?;
    take_while(0.., |c: char| c == ' ' || c == '\t').parse_next(input)?;
    Ok(())
}

/// header 值：到 CRLF / LF 之前的所有内容（不允许空）。
fn header_value<'a>(input: &mut &'a str) -> ModalResult<&'a str> {
    take_while(1.., |c: char| c != '\r' && c != '\n').parse_next(input)
}

/// 解析一行 header：`name: value` + 行结束符。
fn parse_one_header<'a>(input: &mut &'a str) -> ModalResult<Header<'a>> {
    let name = header_name(input)?;
    colon_space(input)?;
    let value = header_value(input)?;
    line_ending(input)?;
    Ok(Header { name, value })
}

/// 解析一连串 header，直到空行（CRLFCRLF / LFLF / EOF）。
///
/// 失败模式：
/// - 输入一开始就为空 → 返回 `Ok` 与空 Vec。
/// - 名称非法 / 缺冒号 / 缺值 → `ParseError` 携带位置信息。
pub fn parse_headers(input: &str) -> Result<(&str, Vec<Header<'_>>), ParseError> {
    let mut s = input;
    let mut out = Vec::new();
    let orig_ptr = s.as_ptr();
    let orig_len = s.len();
    while !s.is_empty() && !s.starts_with("\r\n") && !s.starts_with('\n') {
        let h = match parse_one_header(&mut s) {
            Ok(h) => h,
            Err(e) => return Err(convert_err(e, orig_ptr, orig_len, s)),
        };
        out.push(h);
    }
    if let Err(e) = opt(line_ending).parse_next(&mut s) {
        return Err(convert_err(e, orig_ptr, orig_len, s));
    }
    Ok((s, out))
}

/// 把 `ErrMode<ContextError>` 转换为携带字节偏移的 [`ParseError`]。
fn convert_err(err: E, orig_ptr: *const u8, orig_len: usize, current: &str) -> ParseError {
    let inner = match err {
        ErrMode::Backtrack(c) | ErrMode::Cut(c) => c,
        ErrMode::Incomplete(_) => ContextError::new(),
    };
    // 失败位置：orig_ptr 偏移。
    let position = unsafe { current.as_ptr().offset_from(orig_ptr) } as usize;
    let _ = orig_len;
    ParseError { position, inner }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_two_headers_then_empty_line() {
        let raw = "Host: example.com\r\nUser-Agent: rust\r\n\r\nbody";
        let (rest, headers) = parse_headers(raw).unwrap();
        assert_eq!(rest, "body");
        assert_eq!(headers.len(), 2);
        assert_eq!(headers[0].name, "Host");
        assert_eq!(headers[0].value, "example.com");
        assert_eq!(headers[1].name, "User-Agent");
        assert_eq!(headers[1].value, "rust");
    }

    #[test]
    fn parses_lf_only() {
        let raw = "Host: a\nUser-Agent: b\n\n";
        let (rest, headers) = parse_headers(raw).unwrap();
        assert_eq!(rest, "");
        assert_eq!(headers.len(), 2);
        assert_eq!(headers[0].name, "Host");
        assert_eq!(headers[0].value, "a");
        assert_eq!(headers[1].name, "User-Agent");
        assert_eq!(headers[1].value, "b");
    }

    #[test]
    fn empty_input_yields_no_headers() {
        let (rest, headers) = parse_headers("").unwrap();
        assert_eq!(rest, "");
        assert!(headers.is_empty());
    }

    #[test]
    fn name_allows_dash_and_underscore() {
        let raw = "X-Custom-Token: abc_def-123\r\n\r\n";
        let (rest, headers) = parse_headers(raw).unwrap();
        assert_eq!(rest, "");
        assert_eq!(headers[0].name, "X-Custom-Token");
        assert_eq!(headers[0].value, "abc_def-123");
    }

    #[test]
    fn bad_format_returns_err_with_position() {
        let raw = "Host no colon\r\n\r\n";
        let err = parse_headers(raw).unwrap_err();
        assert!(err.position > 0);
    }

    #[test]
    fn borrows_zero_copy() {
        let raw = String::from("Name: Value\r\n\r\n");
        let raw_ptr = raw.as_ptr();
        let (rest, headers) = parse_headers(&raw).unwrap();
        assert!(rest.is_empty());
        assert_eq!(headers[0].name, "Name");
        let name_ptr = headers[0].name.as_ptr();
        assert!(name_ptr >= raw_ptr);
        assert!(name_ptr < unsafe { raw_ptr.add(raw.len()) });
    }
}
