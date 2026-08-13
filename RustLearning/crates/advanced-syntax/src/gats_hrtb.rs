//! 泛型关联类型（GATs）与高阶 trait 约束（HRTBs）。
//!
//! GAT 允许 trait 携带引用了 trait 自身泛型参数的关联类型，
//! 这解锁了诸如“具有任意生命周期的项”这样的类型族，
//! 以及带有自引用数据的 arena。
//!
//! HRTB（`for<'a>`）表示对 *每一个* 生命周期都必须成立的约束。

/// 一个小型“借出”迭代器：`Item` 借用自迭代器自身，
/// 但具体的生命周期由 GAT 捕获。
pub trait LendingIterator {
    type Item<'a>
    where
        Self: 'a;

    fn next(&mut self) -> Option<Self::Item<'_>>;
}

/// 一个借用自字符串切片的空白符号分词器。
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

/// 高阶 trait 约束：回调必须接受任意生命周期。
pub fn call_with_any<F>(mut f: F)
where
    F: for<'a> FnMut(&'a str),
{
    f("first");
    f("second-lifetime");
}

/// 一个便捷辅助函数，允许调用者使用具有固定生命周期的回调来变换元素。
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
        assert_eq!(collected, vec![5, 15]);
    }

    #[test]
    fn map_first_runs() {
        let out: Vec<String> = map_first(vec![1, 2, 3], |n| format!("{n}!"));
        assert_eq!(out, vec!["1!", "2!", "3!"]);
    }
}
