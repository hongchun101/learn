//! Ch04 — crossbeam: faster, more featureful alternatives to `std`.
//!
//! The three crates in this chapter:
//!   - `crossbeam-channel`: MPMC channels with `select!` and `after`
//!   - `crossbeam-queue`: bounded `ArrayQueue<T>`, unbounded `SegQueue<T>`
//!   - `crossbeam-utils`: `Backoff`, `CachePadded`, `ShardedLock`

use crossbeam_channel::{select, tick, unbounded, Receiver, Sender};
use crossbeam_queue::{ArrayQueue, SegQueue};
use crossbeam_utils::{Backoff, CachePadded};
use parking_lot::Mutex;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

/// 1. ArrayQueue<T>: bounded MPMC, no allocation, lock-free.
pub fn array_queue_demo(cap: usize) -> usize {
    let q = Arc::new(ArrayQueue::<i32>::new(cap));
    let mut handles = Vec::new();
    for p in 0..4 {
        let qc = Arc::clone(&q);
        handles.push(thread::spawn(move || {
            for i in 0..1000 {
                qc.push((p * 1000 + i) as i32).unwrap();
            }
        }));
    }
    let qc = Arc::clone(&q);
    let consumer = thread::spawn(move || {
        let mut count = 0;
        while count < 4000 {
            if qc.pop().is_some() {
                count += 1;
            }
        }
        count
    });
    for h in handles {
        h.join().unwrap();
    }
    consumer.join().unwrap()
}

/// 2. SegQueue<T>: unbounded MPMC, lock-free.
pub fn seg_queue_round_trip(n: usize) -> usize {
    let q = Arc::new(SegQueue::<usize>::new());
    let qp = Arc::clone(&q);
    let p = thread::spawn(move || {
        for i in 0..n {
            qp.push(i);
        }
    });
    p.join().unwrap();
    let mut count = 0;
    while q.pop().is_some() {
        count += 1;
    }
    count
}

/// 3. crossbeam channel with select! and tick (timeout).
pub fn select_with_timeout(producers: usize, per_producer: i32) -> usize {
    let (tx, rx) = unbounded::<i32>();
    for p in 0..producers {
        let txc = tx.clone();
        thread::spawn(move || {
            for i in 0..per_producer {
                txc.send(p * 1000 + i).unwrap();
            }
        });
    }
    drop(tx);
    let mut count = 0;
    let deadline = tick(Duration::from_millis(100));
    loop {
        select! {
            recv(rx) -> _ => count += 1,
            recv(deadline) -> _ => break,
        }
    }
    count
}

/// 4. ShardedLock-style pattern: split one logical counter into N
///    physical counters and sum at the end. False sharing avoided with
///    CachePadded.
pub fn sharded_counter(threads: usize, per: i64) -> i64 {
    const SHARDS: usize = 16;
    let counters: Vec<CachePadded<Mutex<i64>>> = (0..SHARDS)
        .map(|_| CachePadded::new(Mutex::new(0)))
        .collect();
    let mut handles = Vec::new();
    for t in 0..threads {
        let c = counters[t % SHARDS].clone();
        handles.push(thread::spawn(move || {
            for _ in 0..per {
                *c.lock() += 1;
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    counters.iter().map(|c| *c.lock()).sum()
}

/// 5. Backoff: the canonical "spin a few times, then yield" pattern.
pub fn backoff_example(initial: usize) -> usize {
    let backoff = Backoff::new();
    let mut spins = 0;
    for _ in 0..initial {
        if backoff.is_completed() {
            break;
        }
        backoff.spin();
        spins += 1;
    }
    spins
}

/// 6. MPMC channel as a primitive.
pub fn mpmc_wrapped<T>(capacity: usize) -> (Sender<T>, Receiver<T>) {
    crossbeam_channel::bounded::<T>(capacity)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn array_queue_round_trip() {
        assert_eq!(array_queue_demo(64), 4000);
    }

    #[test]
    fn seg_queue_round_trip() {
        assert_eq!(seg_queue_round_trip(100_000), 100_000);
    }

    #[test]
    fn select_with_timeout_collects_many() {
        assert_eq!(select_with_timeout(4, 250), 1000);
    }

    #[test]
    fn sharded_counter_no_lost_updates() {
        assert_eq!(sharded_counter(8, 1000), 8000);
    }

    #[test]
    fn backoff_eventually_completes() {
        assert!(backoff_example(10) <= 10);
    }
}
