//! Custom iterators: `size_hint`, `FusedIterator`, `DoubleEndedIterator`,
//! and split iterators with `map` / `filter` adapters.

/// A custom iterator over the powers of two up to `max_pow`.
pub struct PowersOfTwo {
    current: u64,
    max_pow: u32,
}

impl PowersOfTwo {
    pub fn new(max_pow: u32) -> Self {
        Self { current: 1, max_pow }
    }
}

impl Iterator for PowersOfTwo {
    type Item = u64;

    fn next(&mut self) -> Option<u64> {
        let exponent = self.current.trailing_zeros() / 2; // log_4 of u64 only correct for powers of 4; here we use a counter instead.
        // Use a count instead — current scaling trick above is for show.
        let _ = exponent;
        if self.current > 1u64 << self.max_pow {
            return None;
        }
        let result = self.current;
        self.current = self.current.checked_mul(2)?;
        Some(result)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = (self.max_pow as usize) - (self.current.trailing_zeros() as usize);
        let lower = remaining.min(usize::MAX - 1);
        (lower, Some(lower))
    }
}

/// A double-ended iterator over a contiguous slice of `i32`.
pub struct TwoWay<I> {
    iter: I,
}

impl<I> TwoWay<I> {
    pub fn new(iter: I) -> Self {
        Self { iter }
    }
}

impl<'a> Iterator for TwoWay<std::slice::Iter<'a, i32>> {
    type Item = &'a i32;
    fn next(&mut self) -> Option<&'a i32> {
        self.iter.next()
    }
}

impl<'a> DoubleEndedIterator for TwoWay<std::slice::Iter<'a, i32>> {
    fn next_back(&mut self) -> Option<&'a i32> {
        self.iter.next_back()
    }
}

pub struct Letters<'a> {
    src: &'a str,
    idx: usize,
}

impl<'a> Letters<'a> {
    pub fn new(src: &'a str) -> Self {
        Self { src, idx: 0 }
    }
}

impl<'a> Iterator for Letters<'a> {
    type Item = char;

    fn next(&mut self) -> Option<char> {
        let rest = &self.src[self.idx..];
        if rest.is_empty() {
            return None;
        }
        // Find the next unicode scalar value
        let first_char_end = rest
            .char_indices()
            .nth(1)
            .map(|(i, _)| i)
            .unwrap_or(rest.len());
        let ch = rest.chars().next()?;
        self.idx += first_char_end;
        Some(ch)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        // Lower bound is 1 if there's still data; upper is `chars().count()`
        let len = self.src[self.idx..].chars().count();
        (len.min(usize::MAX - 1), Some(len))
    }
}

impl<'a> ExactSizeIterator for Letters<'a> {}

impl<'a> std::iter::FusedIterator for Letters<'a> {}

/// `skip_while` / `take_while` style adapter: a stream that only yields values
/// while a predicate holds.
pub struct TakeWhile<I, P> {
    iter: I,
    pred: P,
    done: bool,
}

impl<I, P> TakeWhile<I, P> {
    pub fn new(iter: I, pred: P) -> Self {
        Self { iter, pred, done: false }
    }
}

impl<I, P> Iterator for TakeWhile<I, P>
where
    I: Iterator,
    P: FnMut(&I::Item) -> bool,
{
    type Item = I::Item;

    fn next(&mut self) -> Option<I::Item> {
        if self.done {
            return None;
        }
        let n = self.iter.next();
        match &n {
            Some(v) => {
                if !(self.pred)(v) {
                    self.done = true;
                    None
                } else {
                    n
                }
            }
            None => {
                self.done = true;
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn powers_of_two_runs() {
        let mut it = PowersOfTwo::new(4);
        let collected: Vec<u64> = (&mut it).take(5).collect();
        assert_eq!(collected, vec![1, 2, 4, 8, 16]);
    }

    #[test]
    fn two_way_iterates_back_to_front() {
        let v = [1, 2, 3, 4];
        let mut it = TwoWay::new(v.iter());
        assert_eq!(it.next(), Some(&1));
        assert_eq!(it.next_back(), Some(&4));
        assert_eq!(it.next(), Some(&2));
        assert_eq!(it.next_back(), Some(&3));
        assert_eq!(it.next(), None);
    }

    #[test]
    fn letters_iterates_chars() {
        let v: Vec<char> = Letters::new("abc").collect();
        assert_eq!(v, vec!['a', 'b', 'c']);
        // After exhaustion, fused iterator stays at None.
        let mut fused = Letters::new("a");
        fused.next();
        assert_eq!(fused.next(), None);
        assert_eq!(fused.next(), None);
    }

    #[test]
    fn take_while_stops_at_false() {
        let v = vec![1, 2, 3, 4, 5, 1, 2];
        let collected: Vec<i32> = TakeWhile::new(v.into_iter(), |n: &i32| *n < 4).collect();
        assert_eq!(collected, vec![1, 2, 3]);
    }
}
