//! Generic associated types (GATs) and higher-ranked trait bounds (HRTBs).
//!
//! GATs let a trait carry associated types that mention the trait's own
//! generic parameters. This unlocks type families like "items with any
//! lifetime" in iterators and arenas with self-referential data.
//!
//! HRTBs (`for<'a>`) express bounds that must hold for *every* lifetime.

/// A small lending iterator: `Item` borrows from this iterator, but the
/// precise lifetime is captured by the GAT.
pub trait LendingIterator {
    type Item<'a>
    where
        Self: 'a;

    fn next(&mut self) -> Option<Self::Item<'_>>;
}

/// A whitespace tokenizer that borrows from a string slice.
pub struct SplitWhitespace<'src> {
    src: &'src str,
}

impl<'src> SplitWhitespace<'src> {
    pub fn new(src: &'src str) -> Self {
        Self { src }
    }
}

impl<'src> LendingIterator for SplitWhitespace<'src> {
    type Item<'a>
        = &'a str
    where
        Self: 'a;

    fn next(&mut self) -> Option<&str> {
        let s = self.src.trim_start();
        if s.is_empty() {
            return None;
        }
        let end = s.find(char::is_whitespace).unwrap_or(s.len());
        let word = &s[..end];
        self.src = &s[end..];
        Some(word)
    }
}

/// A higher-ranked trait bound: the callback must accept any lifetime.
pub fn call_with_any<F>(mut f: F)
where
    F: for<'a> FnMut(&'a str),
{
    f("first");
    f("second-lifetime");
}

/// Convenience helper that lets a caller transform items with a callback
/// that has a fixed lifetime.
pub fn map_first<I, F, T>(iter: I, mut f: F) -> Vec<T>
where
    I: IntoIterator,
    F: FnMut(&I::Item) -> T,
    I::Item: Clone,
{
    let mut out = Vec::new();
    for item in iter {
        out.push(f(&item));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_whitespace_borrows_from_source() {
        let source = String::from("alpha  beta   gamma");
        let mut iter = SplitWhitespace::new(&source);
        assert_eq!(iter.next(), Some("alpha"));
        assert_eq!(iter.next(), Some("beta"));
        assert_eq!(iter.next(), Some("gamma"));
        assert_eq!(iter.next(), None);
        assert!(source.starts_with("alpha"));
    }

    #[test]
    fn call_with_any_invokes_twice() {
        let mut collected = Vec::new();
        call_with_any(|s| collected.push(s.len()));
        assert_eq!(collected, vec![5, 14]);
    }

    #[test]
    fn map_first_runs() {
        let out: Vec<String> = map_first(vec![1, 2, 3], |n| format!("{n}!"));
        assert_eq!(out, vec!["1!", "2!", "3!"]);
    }
}
