//! Ch05 — lock-free primitives.
//!
//! The three building blocks of lock-free code:
//!   1. CAS via `AtomicPtr`, `AtomicUsize`
//!   2. The Treiber stack (a classic LIFO)
//!   3. The Michael-Scott SPSC queue (the classic FIFO)
//!
//! All `unsafe` blocks are annotated with a SAFETY comment. This
//! chapter is deliberately *not* a production-grade library; the real
//! crossbeam crate has hazard-pointer support. Here we show the
//! *shape* of each algorithm.

use crossbeam_utils::Backoff;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::Arc;

/// 1. Seqlock: single writer, many readers, no allocation.
///    Readers retry if they observe a write in progress.
pub struct SeqLock<T: Copy> {
    seq: std::sync::atomic::AtomicUsize,
    data: *mut T,
}

// SAFETY: SeqLock is Send/Sync iff T is Send/Sync.
unsafe impl<T: Copy + Send> Send for SeqLock<T> {}
unsafe impl<T: Copy + Send + Sync> Sync for SeqLock<T> {}

impl<T: Copy> SeqLock<T> {
    pub fn new(initial: T) -> Self {
        let boxed = Box::into_raw(Box::new(initial));
        SeqLock {
            seq: std::sync::atomic::AtomicUsize::new(0),
            data: boxed,
        }
    }

    /// SAFETY: caller must ensure exclusive write access (one writer
    /// at a time, period). No concurrent `read`.
    pub unsafe fn write(&self, value: T) {
        let s = self.seq.fetch_add(1, Ordering::Release);
        debug_assert!(s % 2 == 0, "SeqLock: write during write");
        // SAFETY: `self.data` is exclusively ours because no other
        // thread can call `write` concurrently (caller contract).
        unsafe {
            *self.data = value;
        }
        self.seq.store(s + 2, Ordering::Release);
    }

    pub fn read(&self) -> T {
        let backoff = Backoff::new();
        loop {
            let s1 = self.seq.load(Ordering::Acquire);
            if s1 % 2 == 1 {
                backoff.spin();
                continue;
            }
            // SAFETY: the load of `self.data` is followed by an acquire
            // load of `seq`. If the second seq load matches the first
            // and both are even, the data is consistent.
            let v = unsafe { *self.data };
            let s2 = self.seq.load(Ordering::Acquire);
            if s1 == s2 {
                return v;
            }
            backoff.spin();
        }
    }
}

impl<T: Copy> Drop for SeqLock<T> {
    fn drop(&mut self) {
        // SAFETY: in `Drop`, no other thread can access `self`.
        unsafe {
            drop(Box::from_raw(self.data));
        }
    }
}

/// 2. Treiber stack: lock-free LIFO.
pub struct TreiberStack<T> {
    head: AtomicPtr<Node<T>>,
}

struct Node<T> {
    value: T,
    next: *mut Node<T>,
}

unsafe impl<T: Send> Send for TreiberStack<T> {}
unsafe impl<T: Send + Sync> Sync for TreiberStack<T> {}

impl<T> TreiberStack<T> {
    pub fn new() -> Self {
        TreiberStack {
            head: AtomicPtr::new(std::ptr::null_mut()),
        }
    }

    pub fn push(&self, v: T) {
        let n = Box::into_raw(Box::new(Node {
            value: v,
            next: std::ptr::null_mut(),
        }));
        let backoff = Backoff::new();
        loop {
            let head = self.head.load(Ordering::Relaxed);
            // SAFETY: `n` is exclusively ours; we are the only one
            // setting its `next` field at this point.
            unsafe {
                (*n).next = head;
            }
            if self
                .head
                .compare_exchange_weak(head, n, Ordering::Release, Ordering::Relaxed)
                .is_ok()
            {
                return;
            }
            backoff.spin();
        }
    }

    pub fn pop(&self) -> Option<T> {
        let backoff = Backoff::new();
        loop {
            let head = self.head.load(Ordering::Acquire);
            if head.is_null() {
                return None;
            }
            // SAFETY: `head` is non-null and was allocated by `push`.
            // The acquire load synchronises with the `release` in push.
            let next = unsafe { (*head).next };
            if self
                .head
                .compare_exchange_weak(head, next, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                // SAFETY: we just exclusively claimed `head`.
                let node = unsafe { Box::from_raw(head) };
                return Some(node.value);
            }
            backoff.spin();
        }
    }
}

impl<T> Default for TreiberStack<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// 3. Michael-Scott SPSC queue.
pub struct MsSpsc<T> {
    head: *mut Node<T>,
    tail: *mut Node<T>,
}

struct Node<T> {
    value: Option<T>,
    next: *mut Node<T>,
}

unsafe impl<T: Send> Send for MsSpsc<T> {}
unsafe impl<T: Send> Sync for MsSpsc<T> {}

impl<T> MsSpsc<T> {
    pub fn new() -> Self {
        let dummy = Box::into_raw(Box::new(Node {
            value: None,
            next: std::ptr::null_mut(),
        }));
        MsSpsc {
            head: dummy,
            tail: dummy,
        }
    }

    /// Producer-only. SAFETY: only one thread may call `push`.
    pub unsafe fn push(&self, v: T) {
        let n = Box::into_raw(Box::new(Node {
            value: Some(v),
            next: std::ptr::null_mut(),
        }));
        // SAFETY: we are the sole writer to `tail->next`.
        unsafe {
            (*self.tail).next = n;
        }
        self.tail = n;
    }

    /// Consumer-only. SAFETY: only one thread may call `pop`.
    pub unsafe fn pop(&self) -> Option<T> {
        let next = unsafe { (*self.head).next };
        if next.is_null() {
            return None;
        }
        let v = unsafe { (*next).value.take() };
        // recycle the dummy
        unsafe {
            drop(Box::from_raw(self.head));
        }
        self.head = next;
        v
    }
}

impl<T> Default for MsSpsc<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> Drop for MsSpsc<T> {
    fn drop(&mut self) {
        // SAFETY: drain any remaining
        unsafe {
            while self.pop().is_some() {}
            drop(Box::from_raw(self.head));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn seqlock_serial_writes() {
        let s = SeqLock::new(0u64);
        // SAFETY: no concurrent read in this test
        unsafe {
            s.write(42);
        }
        assert_eq!(s.read(), 42);
        // SAFETY: no concurrent read
        unsafe {
            s.write(100);
        }
        assert_eq!(s.read(), 100);
    }

    #[test]
    fn treiber_stack_lifo_count() {
        let s: Arc<TreiberStack<i32>> = Arc::new(TreiberStack::new());
        let mut handles = Vec::new();
        for t in 0..4 {
            let sc = Arc::clone(&s);
            handles.push(thread::spawn(move || {
                for i in 0..1000 {
                    sc.push(t * 1000 + i);
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        let mut popped = 0;
        while s.pop().is_some() {
            popped += 1;
        }
        assert_eq!(popped, 4000);
    }

    #[test]
    fn ms_spsc_round_trip() {
        let q: Arc<MsSpsc<i32>> = Arc::new(MsSpsc::new());
        let qc = Arc::clone(&q);
        let producer = thread::spawn(move || unsafe {
            for i in 0..1000 {
                qc.push(i);
            }
        });
        let qc = Arc::clone(&q);
        let consumer = thread::spawn(move || unsafe {
            let mut sum = 0;
            let mut count = 0;
            while count < 1000 {
                if let Some(v) = qc.pop() {
                    sum += v;
                    count += 1;
                }
            }
            sum
        });
        producer.join().unwrap();
        let s = consumer.join().unwrap();
        assert_eq!(s, (0..1000).sum::<i32>());
    }
}
