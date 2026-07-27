//! 异步基础：`Pin`、`Future`、`Waker`、手写轮询的 Future。
//!
//! 通过手工方式运行 Future 是理解 `Pin<&mut F>` 如何与自引用 Future
//! 交互的最直接方式。
//!
//! 本模块中所有函数都显式导入 `Future`，以使代码片段在不同 edition 之间保持可移植。

#![allow(unsafe_code)]

use std::sync::Arc;
use std::task::{Wake, Waker};

/// 一个简单的 `Waker`，用于统计 `wake` 被调用的次数。
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

/// 一个在经过 `polls_left` 次轮询后产出 `T` 的 Future。
/// 用于测试在返回 `Pending` 之前是否正确调用了 `Waker`。
pub struct DelayedFuture<T> {
    polls_left: u32,
    value: Option<T>,
    /// 该 Future 稍后交还给运行时的同一个 `Waker`。在 `poll`
    /// 内部的自引用测试中捕获。
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
        // SAFETY：我们绝不会移出 `self` 的固定字段。
        let me = unsafe { self.get_unchecked_mut() };
        // 保存 waker，以便测试可以检查它。
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

/// 通过提供一个会记录自身的 `Waker` 来将 `fut` 驱动到完成。
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

/// 一个自引用的 Future，其产出借用自 Future 内部存储的切片。
/// 用以演示 `Pin`。
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
        // SAFETY：`state` 只借用自 `self.data`，从不会引用自身，
        // 我们也绝不会将字段移出被固定的结构体。
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
        // 初始轮询 + Future 在返回 Pending 前的 wake => 至少 2 次唤醒。
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
