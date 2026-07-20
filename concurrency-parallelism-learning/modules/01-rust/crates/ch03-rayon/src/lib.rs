//! Ch03 — rayon: data-parallel iterators.
//!
//! The mental model: a parallel iterator is *the same* iterator, but
//! the work is split across threads. `par_iter` returns a
//! `ParallelIterator` whose methods are functionally identical to
//! `Iterator`.
//!
//! The runtime: a global thread pool sized to the number of CPUs. For
//! a custom pool (e.g. a smaller dedicated pool), use
//! `ThreadPoolBuilder::new().build()`.

use rayon::prelude::*;
use rayon::{ThreadPool, ThreadPoolBuilder};

/// 1. parallel sum.
pub fn par_sum(xs: &[i64]) -> i64 {
    xs.par_iter().copied().sum()
}

/// 2. parallel map, then collect.
pub fn par_doubled(xs: Vec<i32>) -> Vec<i32> {
    xs.par_iter().map(|i| i * 2).collect()
}

/// 3. par_chunks: process in fixed-size chunks.
pub fn par_chunks_sum(xs: &[i64], chunk: usize) -> Vec<i64> {
    xs.par_chunks(chunk)
        .map(|c| c.iter().copied().sum::<i64>())
        .collect()
}

/// 4. par_bridge: turn any sequential iterator into a parallel one.
pub fn par_bridge_count<S>(src: S) -> usize
where
    S: IntoIterator + Send,
    S::Item: Send,
{
    use rayon::iter::ParallelBridge;
    src.into_iter().par_bridge().count()
}

/// 5. scope: spawn parallel tasks that borrow from the parent stack.
pub fn par_scope_write(n: usize) -> Vec<usize> {
    let mut out = vec![0usize; n];
    rayon::scope(|s| {
        for (i, slot) in out.iter_mut().enumerate() {
            s.spawn(move |_| *slot = i * 2);
        }
    });
    out
}

/// 6. custom thread pool.
pub fn custom_pool(n_threads: usize) -> ThreadPool {
    ThreadPoolBuilder::new()
        .num_threads(n_threads)
        .thread_name(|i| format!("cp-rayon-{i}"))
        .build()
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parallel_sum_matches_sequential() {
        let xs: Vec<i64> = (1..=1_000_000).collect();
        let sum = par_sum(&xs);
        let expected: i64 = xs.iter().sum();
        assert_eq!(sum, expected);
    }

    #[test]
    fn parallel_map_preserves_order() {
        let v: Vec<i32> = (0..1000).collect();
        let out = par_doubled(v.clone());
        assert_eq!(out, v.iter().map(|i| i * 2).collect::<Vec<_>>());
    }

    #[test]
    fn parallel_chunks_total_equals_input_sum() {
        let xs: Vec<i64> = (1..=1000).collect();
        let parts = par_chunks_sum(&xs, 50);
        let total: i64 = parts.iter().sum();
        assert_eq!(total, xs.iter().sum());
    }

    #[test]
    fn par_bridge_counts() {
        let n = par_bridge_count(0..1234usize);
        assert_eq!(n, 1234);
    }

    #[test]
    fn par_scope_writes_correctly() {
        let out = par_scope_write(64);
        for (i, v) in out.iter().enumerate() {
            assert_eq!(*v, i * 2);
        }
    }
}
