//! Lifetimes: elision, subtyping, variance, and advanced bounds.

use std::borrow::Cow;

/// The classic parse-first-then-allocate pattern: copy the smallest possible
/// string slice from a borrowed input, with explicit lifetimes.
pub fn first_word(input: &str) -> &str {
    let bytes = input.as_bytes();
    bytes
        .iter()
        .enumerate()
        .find_map(|(idx, &b)| (b == b' ').then_some(idx))
        .map_or(input, |idx| &input[..idx])
}

/// Two-input elision: output lifetime is the shorter of the two.
pub fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() >= y.len() { x } else { y }
}

/// `Cow` is the canonical example of returning borrowed-or-owned data.
pub fn normalize(input: &str) -> Cow<'_, str> {
    if input.chars().any(|c| c.is_ascii_uppercase()) {
        Cow::Owned(input.to_ascii_lowercase())
    } else {
        Cow::Borrowed(input)
    }
}

/// Variance: a short borrow is a subtype of a long borrow. `&'a T` is
/// covariant in `'a` and `T`.
pub fn shorter_to_longer<'short, 'long>(short: &'short str, _: &'long str) -> &'short str
where
    'long: 'short,
{
    short
}

/// `'static` is the longest possible lifetime: the data lives for the entire
/// process.
pub fn first_word_static() -> &'static str {
    "static-first-word"
}

/// A struct that holds a borrowed source and tracks its own cursor through it.
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

/// `for<'a>` higher-ranked trait bound — the closure must accept any
/// lifetime. Used for cross-erasure callbacks.
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
