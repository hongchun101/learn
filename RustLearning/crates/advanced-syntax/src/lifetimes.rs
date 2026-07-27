//! 生命周期：省略、子类型、协变与高级约束。

use std::borrow::Cow;

/// 经典的“先解析再分配”模式：从借用的输入中拷贝出尽可能小的字符串切片，并显式标注生命周期。
pub fn first_word(input: &str) -> &str {
    let bytes = input.as_bytes();
    bytes
        .iter()
        .enumerate()
        .find_map(|(idx, &b)| (b == b' ').then_some(idx))
        .map_or(input, |idx| &input[..idx])
}

/// 双输入的生命周期省略：输出生命周期取两者中较短的那个。
pub fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() >= y.len() { x } else { y }
}

/// `Cow` 是返回“借用或拥有”数据的经典示例。
pub fn normalize(input: &str) -> Cow<'_, str> {
    if input.chars().any(|c| c.is_ascii_uppercase()) {
        Cow::Owned(input.to_ascii_lowercase())
    } else {
        Cow::Borrowed(input)
    }
}

/// 协变性：较短的借用是较长借用的子类型。`&'a T` 对 `'a` 和 `T` 都是协变的。
pub fn shorter_to_longer<'short, 'long>(short: &'short str, _: &'long str) -> &'short str
where
    'long: 'short,
{
    short
}

/// `'static` 是最长的生命周期：数据在整个进程运行期间都有效。
pub fn first_word_static() -> &'static str {
    "static-first-word"
}

/// 一个持有借用源数据并跟踪自身游标的结构体。
#[derive(Debug, Clone)]
pub struct Parser<'src> {
    source: &'src str,
    cursor: usize,
}

impl<'src> Parser<'src> {
    pub fn new(source: &'src str) -> Self {
        Self { source, cursor: 0 }
    }

    pub fn remaining(&self) -> &'src str {
        &self.source[self.cursor..]
    }

    pub fn peek(&self) -> Option<u8> {
        self.source.as_bytes().get(self.cursor).copied()
    }

    pub fn advance(&mut self, n: usize) {
        self.cursor = self.cursor.saturating_add(n).min(self.source.len());
    }
}

/// `for<'a>` 高阶 trait 约束 —— 闭包必须接受任意生命周期。
/// 适用于跨擦除的回调。
pub fn starts_with<F>(pred: F, slice: &str) -> bool
where
    F: for<'a> Fn(&'a str) -> bool,
{
    pred(slice)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_word_returns_token() {
        assert_eq!(first_word("hello world"), "hello");
        assert_eq!(first_word("nospaces"), "nospaces");
    }

    #[test]
    fn longest_picks_bigger() {
        assert_eq!(longest("ab", "abc"), "abc");
    }

    #[test]
    fn normalize_handles_owned_path() {
        let owned: String = normalize("HeLLo").into_owned();
        assert_eq!(owned, "hello");
    }

    #[test]
    fn normalize_handles_borrowed_path() {
        let owned = normalize("hello");
        assert_eq!(owned.as_ref(), "hello");
        assert!(matches!(owned, Cow::Borrowed(_)));
    }

    #[test]
    fn variance_allows_shorter_borrow() {
        let s = String::from("short");
        let short = &s[..3];
        let long_lived: &str = "some longer-lived source";
        let out = shorter_to_longer(short, long_lived);
        assert_eq!(out, "sho");
    }

    #[test]
    fn parser_steps_through_source() {
        let mut p = Parser::new("abc");
        assert_eq!(p.peek(), Some(b'a'));
        p.advance(2);
        assert_eq!(p.remaining(), "c");
    }

    #[test]
    fn higher_ranked_with_str_callback() {
        let called = |s: &str| s.starts_with("abc");
        assert!(starts_with(called, "abcdef"));
        assert!(!starts_with(called, "zzz"));
    }

    #[test]
    fn static_reference_returns_value() {
        assert_eq!(first_word_static(), "static-first-word");
    }
}
