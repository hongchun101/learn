//! Async foundations: `Pin`, `Future`, `Waker`, hand-polled futures.
//!
//! Running futures by hand is the most direct way to understand how
//! `Pin<&mut F>` interacts with self-referential futures.
//!
//! All functions in this module carry an explicit `Future` import so the
//! snippets stay portable across editions.

#![allow(unsafe_code)]

use std::sync::Arc;
use std::task::{Wake, Waker};

/// A trivial `Waker` that counts how many times `wake` was invoked.
pub struct CountingWaker {
    pub wake_count: Arc<std::sync::atomic::AtomicUsize>,
}

impl Wake for CountingWaker {
    fn wake(self: Arc<Self>) {
        self.wake_count
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }

    fn wake_by_ref(self: &Arc<Self>) {
        self.wake_count
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
}

pub fn counting_waker() -> (Arc<CountingWaker>, Waker) {
    let cw = Arc::new(CountingWaker {
        wake_count: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
    });
    let waker = Arc::clone(&cw).into();
    (cw, waker)
}

/// A future that yields `T` after `polls_left` polls. Used to test that a
/// `Waker` is properly invoked before yielding `Pending`.
pub struct DelayedFuture<T> {
    polls_left: u32,
    value: Option<T>,
    /// The same waker this future will hand back to the runtime. Captured for
    /// self-referential testing inside `poll`.
    captured: Option<Waker>,
}

impl<T> DelayedFuture<T> {
    pub fn new(value: T, polls: u32) -> Self {
        Self {
            polls_left: polls,
            value: Some(value),
            captured: None,
        }
    }
}

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

impl<T> Future for DelayedFuture<T> {
    type Output = T;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<T> {
        // SAFETY: we never move out of `self`'s pinned fields.
        let me = unsafe { self.get_unchecked_mut() };
        // Save the waker so the test can examine it.
        if me.captured.is_none() {
            me.captured = Some(cx.waker().clone());
        }
        if me.polls_left == 0 {
            return Poll::Ready(me.value.take().expect("polled after completion"));
        }
        me.polls_left -= 1;
        cx.waker().wake_by_ref();
        Poll::Pending
    }
}

/// Drive `fut` to completion by handing it a `Waker` that records itself.
pub fn block_on<T>(fut: impl Future<Output = T>, waker: &Waker) -> T {
    let mut cx = Context::from_waker(waker);
    let mut fut = Box::pin(fut);
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(v) => return v,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

/// A self-referential future that produces output that borrows from a slice
/// stored inside the future. Demonstrates `Pin`.
pub struct SliceIndexFuture<'data> {
    data: &'data [u8],
    state: SliceState<'data>,
    pending: bool,
}

#[allow(dead_code)]
enum SliceState<'data> {
    Searching(usize),
    Done(usize, &'data [u8]),
}
impl<'data> SliceIndexFuture<'data> {
    pub fn first_nonzero(data: &'data [u8]) -> Self {
        Self {
            data,
            state: SliceState::Searching(0),
            pending: false,
        }
    }
}

impl<'data> Future for SliceIndexFuture<'data> {
    type Output = Option<&'data [u8]>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        // SAFETY: `state` only borrows from `self.data`, never references
        // itself, and we never move fields out of the pinned struct.
        let me = unsafe { self.get_unchecked_mut() };
        if me.pending {
            return Poll::Pending;
        }
        me.pending = true;
        cx.waker().wake_by_ref();
        let idx = me.data.iter().position(|&b| b != 0).unwrap_or(me.data.len());
        let rest = &me.data[idx..];
        me.state = SliceState::Done(idx, rest);
        Poll::Ready(if rest.is_empty() { None } else { Some(rest) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    #[test]
    fn counting_waker_increments() {
        let (cw, waker) = counting_waker();
        let fut = DelayedFuture::new(42u32, 1);
        let out = block_on(fut, &waker);
        assert_eq!(out, 42);
        // Initial poll + the future's wake before yielding Pending => at
        // least 2 wake-ups.
        assert!(cw.wake_count.load(Ordering::SeqCst) >= 1);
    }

    #[test]
    fn slice_index_future_returns_tail() {
        let (cw, waker) = counting_waker();
        let fut = SliceIndexFuture::first_nonzero(&[0u8, 0, 1, 2, 3]);
        let out = block_on(fut, &waker);
        assert_eq!(out, Some(&[1u8, 2, 3][..]));
        let _ = cw;
    }
}
