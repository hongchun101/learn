//! Ch01 — `std::thread`, `std::sync`, mpsc, OnceLock, Barrier.
//!
//! The Rust thread story is the simplest of any language: every
//! primitive is in the standard library, and the type system (Send /
//! Sync) prevents the most common data races at compile time.
//!
//! `std::thread::spawn` returns a `JoinHandle<T>`. The closure must
//! be `Send + 'static`; if the compiler rejects your closure, that's
//! the `Send` / `Sync` rules telling you the data you tried to share
//! cannot safely cross thread boundaries.

use std::sync::mpsc;
use std::sync::{Arc, Barrier, Condvar, Mutex, OnceLock, RwLock};
use std::thread;
use std::time::Duration;

/// 1. spawn and join. The closure must own its data; here we capture
///    by move.
pub fn spawn_and_join() -> i32 {
    let handle = thread::spawn(|| {
        let mut s = 0;
        for i in 0..1000 {
            s += i;
        }
        s
    });
    handle.join().unwrap()
}

/// 2. the canonical "share a counter" exercise, with a Mutex.
///    `parking_lot::Mutex` is a faster, non-poisoning alternative.
pub fn shared_counter(n_threads: usize, per_thread: i64) -> i64 {
    let counter = Arc::new(Mutex::new(0i64));
    let mut handles = Vec::with_capacity(n_threads);
    for _ in 0..n_threads {
        let c = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            for _ in 0..per_thread {
                let mut g = c.lock().unwrap();
                *g += 1;
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    let g = counter.lock().unwrap();
    *g
}

/// 3. mpsc — multi-producer single-consumer. The classic Go-channel
///    shape, in the standard library.
pub fn fan_in_mpsc(values: Vec<i32>) -> Vec<i32> {
    let (tx, rx) = mpsc::channel();
    let n = values.len();
    let chunk_size = n / 4 + 1;
    for chunk in values.chunks(chunk_size) {
        let txc = tx.clone();
        let owned: Vec<i32> = chunk.to_vec();
        thread::spawn(move || {
            for v in owned {
                txc.send(v).unwrap();
            }
        });
    }
    drop(tx);
    let mut out = Vec::with_capacity(n);
    while let Ok(v) = rx.recv() {
        out.push(v);
    }
    out.sort();
    out
}

/// 4. Condvar: producer/consumer with bounded buffer.
pub fn producer_consumer(producer_count: usize, items_per_producer: i32) -> i32 {
    let buf = Arc::new((Mutex::new(Vec::<i32>::new()), Condvar::new()));
    let mut handles = Vec::new();
    for p in 0..producer_count {
        let b = Arc::clone(&buf);
        handles.push(thread::spawn(move || {
            for i in 0..items_per_producer {
                let (lock, cvar) = &*b;
                let mut g = lock.lock().unwrap();
                g.push(p as i32 * 1000 + i);
                cvar.notify_one();
            }
        }));
    }
    let total = producer_count * items_per_producer as usize;
    let mut consumed = 0;
    while consumed < total {
        let (lock, cvar) = &*buf;
        let mut g = lock.lock().unwrap();
        while g.is_empty() {
            g = cvar.wait(g).unwrap();
        }
        g.pop();
        consumed += 1;
    }
    for h in handles {
        h.join().unwrap();
    }
    consumed as i32
}

/// 5. RwLock: read-heavy, write-rare.
pub fn rwlock_demo() -> usize {
    let lock = Arc::new(RwLock::new(0usize));
    let mut readers = Vec::new();
    for _ in 0..8 {
        let l = Arc::clone(&lock);
        readers.push(thread::spawn(move || {
            for _ in 0..1000 {
                let _g = l.read().unwrap();
            }
        }));
    }
    let mut writers = Vec::new();
    for _ in 0..2 {
        let l = Arc::clone(&lock);
        writers.push(thread::spawn(move || {
            for _ in 0..1000 {
                let mut g = l.write().unwrap();
                *g += 1;
            }
        }));
    }
    for h in readers {
        h.join().unwrap();
    }
    for h in writers {
        h.join().unwrap();
    }
    *lock.read().unwrap()
}

/// 6. Barrier: N parties all wait, then proceed.
pub fn barrier_demo(workers: usize) -> usize {
    let barrier = Arc::new(Barrier::new(workers));
    let counter = Arc::new(Mutex::new(0usize));
    let mut handles = Vec::new();
    for _ in 0..workers {
        let b = Arc::clone(&barrier);
        let c = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            thread::sleep(Duration::from_millis(1));
            b.wait();
            let mut g = c.lock().unwrap();
            *g += 1;
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    *counter.lock().unwrap()
}

/// 7. OnceLock: process-wide one-time initialisation. Type-safe
///    alternative to `lazy_static` / `Once::call_once`.
pub fn global() -> &'static String {
    static CELL: OnceLock<String> = OnceLock::new();
    CELL.get_or_init(|| String::from("global value"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_and_join_works() {
        assert_eq!(spawn_and_join(), (0..1000).sum::<i32>());
    }

    #[test]
    fn shared_counter_no_lost_updates() {
        assert_eq!(shared_counter(8, 1000), 8000);
    }

    #[test]
    fn mpsc_round_trip() {
        let v: Vec<i32> = (0..100).collect();
        let out = fan_in_mpsc(v.clone());
        assert_eq!(out, v);
    }

    #[test]
    fn producer_consumer_all_consumed() {
        assert_eq!(producer_consumer(4, 250), 1000);
    }

    #[test]
    fn rwlock_writes_apply() {
        assert_eq!(rwlock_demo(), 2000);
    }

    #[test]
    fn barrier_releases_all() {
        assert_eq!(barrier_demo(8), 8);
    }

    #[test]
    fn once_lock_init_once() {
        assert_eq!(global(), "global value");
        assert_eq!(global(), "global value");
    }
}
