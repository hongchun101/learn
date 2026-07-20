//! Ch06 — the six cross-language tasks reimplemented in idiomatic Rust.
//!
//! Contract source: ../../../../src/cross-lang/contracts.ts
//! Reference impl:  ../../../../src/cross-lang/*.ts
//!
//! Each function here corresponds to a task in the contract and
//! asserts the same properties. The tests live in `tests/cross_lang.rs`.

use std::sync::Arc;
use std::time::Duration;

/// 1. fan_out: N inputs, P workers; output order = input order.
pub fn fan_out<I, O, F>(inputs: Vec<I>, parallelism: usize, work: F) -> Vec<O>
where
    I: Send + 'static,
    O: Send + 'static,
    F: Fn(I) -> O + Send + Sync + 'static,
{
    if inputs.is_empty() {
        return Vec::new();
    }
    let p = parallelism.max(1).min(inputs.len());
    let work = Arc::new(work);
    let mut handles = Vec::with_capacity(p);
    let chunk_size = (inputs.len() + p - 1) / p;
    for chunk in inputs.chunks(chunk_size) {
        let work = Arc::clone(&work);
        let owned: Vec<I> = chunk.to_vec();
        handles.push(std::thread::spawn(move || {
            owned.into_iter().map(|x| work(x)).collect::<Vec<O>>()
        }));
    }
    let mut out = Vec::with_capacity(inputs.len());
    for h in handles {
        out.extend(h.join().unwrap());
    }
    out
}

/// 2. pipeline: each element flows through all stages in order.
pub fn pipeline<T, S>(source: Vec<T>, stages: Vec<S>) -> Vec<T>
where
    T: Send,
    S: Fn(T) -> T + Send,
{
    source
        .into_iter()
        .map(|mut v| {
            for stage in &stages {
                v = stage(v);
            }
            v
        })
        .collect()
}

/// 3. rate_limit: token bucket. Produces at most ratePerSec items/sec.
pub fn rate_limit(rate_per_sec: u32, duration_ms: u64) -> usize {
    let interval_us = 1_000_000u64 / rate_per_sec as u64;
    let start = std::time::Instant::now();
    let deadline = start + Duration::from_millis(duration_ms);
    let mut produced = 0usize;
    let mut next = start;
    while std::time::Instant::now() < deadline {
        let now = std::time::Instant::now();
        if now >= next {
            produced += 1;
            next += Duration::from_micros(interval_us);
        } else {
            std::thread::sleep(next - now);
        }
    }
    produced
}

/// 4. barrier: N parties, all callers block until N have arrived.
pub fn barrier(parties: usize) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let arrived = Arc::new(AtomicUsize::new(0));
    let done = Arc::new(std::sync::Barrier::new(parties));
    let mut handles = Vec::new();
    for _ in 0..parties {
        let a = Arc::clone(&arrived);
        let d = Arc::clone(&done);
        handles.push(std::thread::spawn(move || {
            a.fetch_add(1, Ordering::AcqRel);
            d.wait();
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
}

/// 5. mpmc_queue: bounded MPMC via crossbeam-channel.
pub fn mpmc_queue<T>(capacity: usize) -> (crossbeam_channel::Sender<T>, crossbeam_channel::Receiver<T>) {
    crossbeam_channel::bounded::<T>(capacity)
}

/// 6. parallel_reduce: P partitions, sequential reduce per partition,
/// then combine.
pub fn parallel_reduce<T, F>(inputs: Vec<T>, parallelism: usize, combine: F) -> T
where
    T: Send + 'static,
    F: Fn(T, T) -> T + Send + Sync + 'static,
{
    assert!(!inputs.is_empty(), "parallel_reduce: empty");
    let p = parallelism.max(1).min(inputs.len());
    let combine = Arc::new(combine);
    let mut handles = Vec::new();
    let chunk_size = (inputs.len() + p - 1) / p;
    for chunk in inputs.chunks(chunk_size) {
        let owned: Vec<T> = chunk.to_vec();
        let c = Arc::clone(&combine);
        handles.push(std::thread::spawn(move || {
            let mut it = owned.into_iter();
            let first = it.next().expect("non-empty chunk");
            it.fold(first, |a, b| c(a, b))
        }));
    }
    let mut acc: Option<T> = None;
    for h in handles {
        let v = h.join().unwrap();
        acc = Some(match acc {
            None => v,
            Some(a) => combine(a, v),
        });
    }
    acc.unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fan_out_preserves_order() {
        let out = fan_out((0..100i32).collect::<Vec<_>>(), 16, |i| i * 2);
        let expected: Vec<i32> = (0..100).map(|i| i * 2).collect();
        assert_eq!(out, expected);
    }

    #[test]
    fn pipeline_applies_in_order() {
        let stages: Vec<fn(i32) -> i32> = vec![|x| x + 1, |x| x * 2, |x| x - 3];
        let out = pipeline(vec![0, 1, 2, 3], stages);
        assert_eq!(out, vec![-1, 1, 3, 5]);
    }

    #[test]
    fn rate_limit_within_band() {
        let n = rate_limit(200, 100);
        assert!(n >= 15 && n <= 30);
    }

    #[test]
    fn barrier_releases_all() {
        barrier(8);
    }

    #[test]
    fn parallel_reduce_matches_sequential() {
        let xs: Vec<i64> = (1..=1000).collect();
        let seq: i64 = xs.iter().sum();
        for p in [1, 2, 4, 8, 16, 32, 100] {
            let got = parallel_reduce(xs.clone(), p, |a, b| a + b);
            assert_eq!(got, seq);
        }
    }
}
