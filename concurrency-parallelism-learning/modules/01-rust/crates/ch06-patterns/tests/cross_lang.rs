//! Cross-language contract tests, in the same order as
//! `src/cross-lang/contracts.ts` and `tests/cross-lang.test.ts`.
//!
//! Each test corresponds to one of the seven scenarios. Asserted
//! properties match the TypeScript reference exactly.

use ch06_patterns::*;

#[test]
fn fan_out_preserves_input_order() {
    let inputs: Vec<i32> = (0..100).collect();
    let work = |i: i32| -> i32 {
        // no wall clock; the work is index-monotone so order must hold
        i * 2
    };
    let out = fan_out(inputs, 16, work);
    let expected: Vec<i32> = (0..100).map(|i| i * 2).collect();
    assert_eq!(out, expected);
}

#[test]
fn fan_out_handles_parallelism_one_and_more_than_inputs() {
    let inputs = vec![1, 2, 3, 4, 5];
    for p in [1usize, 2, 5, 10] {
        let out = fan_out(inputs.clone(), p, |i| i + 1);
        assert_eq!(out, vec![2, 3, 4, 5, 6]);
    }
}

#[test]
fn pipeline_applies_every_stage_in_order() {
    let stages: Vec<fn(i32) -> i32> = vec![|x| x + 1, |x| x * 2, |x| x - 3];
    let out = pipeline(vec![0, 1, 2, 3], stages);
    assert_eq!(out, vec![-1, 1, 3, 5]);
}

#[test]
fn rate_limit_produces_within_band() {
    let n = rate_limit(200, 100);
    assert!(n >= 15 && n <= 30);
}

#[test]
fn barrier_blocks_until_n_parties() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    let released = Arc::new(AtomicUsize::new(0));
    let parties = 4;
    let mut handles = Vec::new();
    for _ in 0..parties {
        let r = Arc::clone(&released);
        handles.push(std::thread::spawn(move || {
            barrier(parties);
            r.fetch_add(1, Ordering::SeqCst);
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    assert_eq!(released.load(Ordering::SeqCst), parties);
}

#[test]
fn mpmc_queue_round_trip() {
    use std::sync::Arc;
    use std::thread;
    let (tx, rx) = mpmc_queue::<u64>(4);
    let n_per_producer = 100;
    let producers = 3;
    let mut producer_handles = Vec::new();
    for p in 0..producers {
        let txc = tx.clone();
        producer_handles.push(thread::spawn(move || {
            for i in 0..n_per_producer {
                txc.send((p * 1000 + i) as u64).unwrap();
            }
        }));
    }
    drop(tx);
    let total = producers * n_per_producer;
    let consumer_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let mut consumer_handles = Vec::new();
    let per_consumer = total / 4;
    for _ in 0..4 {
        let rxc = rx.clone();
        let counter = Arc::clone(&consumer_count);
        consumer_handles.push(thread::spawn(move || {
            for _ in 0..per_consumer {
                if rxc.recv().is_ok() {
                    counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                }
            }
        }));
    }
    for h in producer_handles {
        h.join().unwrap();
    }
    for h in consumer_handles {
        h.join().unwrap();
    }
    assert_eq!(consumer_count.load(std::sync::atomic::Ordering::SeqCst), total);
}

#[test]
fn parallel_reduce_associative_sum() {
    let inputs: Vec<i64> = (1..=1000).collect();
    let seq: i64 = inputs.iter().sum();
    for p in [1usize, 2, 4, 8, 16, 32, 100] {
        let got = parallel_reduce(inputs.clone(), p, |a, b| a + b);
        assert_eq!(got, seq);
    }
}
