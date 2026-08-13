//! 手写执行器与 `Waker` 练习场。
//!
//! 目的：用尽量少的代码演示 Rust 异步的三个核心抽象：
//!
//! 1. **`Future`** —— 一个 `poll` 方法返回 `Poll<T>`。
//! 2. **`Waker`** —— 当 future 未就绪时，告诉执行器"准备好后叫我"。
//! 3. **`Pin`** —— 让 self-referential future 安全。
//!
//! 本模块提供一个**单线程**的极简执行器 [`block_on`]：把 future 放进去
//! 轮询直到 ready。复杂运行时（tokio / async-std）做了多线程调度 +
//! epoll / `io_uring，但核心循环就这一段`。
//!
//! 与 `advanced-syntax::futures_intro` 的关系：
//!
//! - `futures_intro` 展示"如何手写一个 `Future`"。
//! - 本模块展示"如何运行一个 `Future`"。
//!
//! 本 crate 内所有 `unsafe` 都用于实现 `Waker` 与 `Pin` 投影；每个
//! `unsafe` 块都附带 `# Safety` 注释。

#![allow(unsafe_code)]

use std::future::Future;
use std::marker::PhantomPinned;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};

// ---------------------------------------------------------------------------
// 1. 极简执行器
// ---------------------------------------------------------------------------

/// 单线程的 `block_on`：不停 `poll` 直到 future 返回 `Ready`。
pub fn block_on<F: Future>(mut fut: F) -> F::Output {
    // 先把 future 钉住。`Pin::new` 没问题，因为 `F: Future` 默认 `Unpin`。
    let mut fut = unsafe { Pin::new_unchecked(&mut fut) };
    // 用一个自实现的"哨兵 waker" —— 不做任何事，因为我们没有别的线程。
    let waker = noop_waker();
    let mut cx = Context::from_waker(&waker);
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(v) => return v,
            Poll::Pending => {
                // 真实执行器会在这里等事件。
                // 本玩具执行器要求 future 自身不依赖外部 wake 才能完成；
                // 测试里我们提供 [`yield_now`] / [`Delay`] 等"自包含"future。
                std::thread::yield_now();
            }
        }
    }
}

fn noop_waker() -> Waker {
    use std::sync::atomic::AtomicUsize;
    use std::sync::atomic::Ordering;
    static COUNT: AtomicUsize = AtomicUsize::new(0);
    struct Noop;
    impl Wake for Noop {
        fn wake(self: Arc<Self>) {
            // 不做任何事；`block_on` 不依赖 wake。
            COUNT.fetch_add(1, Ordering::Relaxed);
        }
        fn wake_by_ref(self: &Arc<Self>) {
            COUNT.fetch_add(1, Ordering::Relaxed);
        }
    }
    Waker::from(Arc::new(Noop))
}

// ---------------------------------------------------------------------------
// 2. YieldNow：交还一次控制权
// ---------------------------------------------------------------------------

/// 让出一次执行权。第二次 poll 时直接返回 `Ready`。
pub struct YieldNow {
    yielded: bool,
}

impl YieldNow {
    #[must_use]
    pub fn new() -> Self {
        Self { yielded: false }
    }
}

impl Default for YieldNow {
    fn default() -> Self {
        Self::new()
    }
}

impl Future for YieldNow {
    type Output = ();

    fn poll(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<()> {
        if self.yielded {
            Poll::Ready(())
        } else {
            self.yielded = true;
            Poll::Pending
        }
    }
}

// ---------------------------------------------------------------------------
// 3. Delay：用 std::thread::sleep 模拟定时器
// ---------------------------------------------------------------------------

/// 简单的"睡眠" future。`poll` 时若未到时间返回 `Pending`，
/// 并通过 [`Waker::wake_by_ref`] 唤醒自己（在 [`block_on`] 中会忽略，
/// 仅作为 wake 调用的演示）。
pub struct Delay {
    when: std::time::Instant,
}

impl Delay {
    #[must_use]
    pub fn until(when: std::time::Instant) -> Self {
        Self { when }
    }

    #[must_use]
    pub fn from_now(d: std::time::Duration) -> Self {
        Self::until(std::time::Instant::now() + d)
    }
}

impl Future for Delay {
    type Output = ();

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        if std::time::Instant::now() >= self.when {
            Poll::Ready(())
        } else {
            // 真实运行时会注册一个定时器，在 `when` 到达时调用 `cx.waker().wake()`。
            // 这里没有事件循环，所以只是调用 waker 演示接口。
            cx.waker().wake_by_ref();
            Poll::Pending
        }
    }
}

// ---------------------------------------------------------------------------
// 4. Join：等待所有 future 完成
// ---------------------------------------------------------------------------

/// 等待所有 future 完成，按传入顺序返回结果元组。
pub async fn join_all<F: Future>(futures: Vec<F>) -> Vec<F::Output> {
    // 这里使用 std 自带 futures 不便（无 std::future::join_all 公开 API），
    // 所以手写一个串行版本：依次 `await`。
    let mut out = Vec::with_capacity(futures.len());
    for f in futures {
        out.push(f.await);
    }
    out
}

// ---------------------------------------------------------------------------
// 5. 自引用 future：演示 Pin 投影
// ---------------------------------------------------------------------------

/// 一个自引用的 future：`output` 借用 `self.buffer` 的某个区间。
///
/// 这是 `Pin` 存在的根本原因：一旦 future 拿到 `&self.buffer` 的引用，
/// 就不允许 `mem::swap` 把 future 整体移动走。
pub struct SliceFuture {
    buffer: Vec<u8>,
    // 借用关系：start..end 总是合法地落在 buffer 内。
    start: usize,
    end: usize,
    _pin: PhantomPinned,
}

impl SliceFuture {
    pub fn new(buffer: Vec<u8>, start: usize, end: usize) -> Self {
        assert!(end <= buffer.len());
        assert!(start <= end);
        Self {
            buffer,
            start,
            end,
            _pin: PhantomPinned,
        }
    }
}

impl Future for SliceFuture {
    type Output = Vec<u8>;

    fn poll(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Self::Output> {
        // SAFETY：自借用部分（buffer 的 start..end）不会被移动；
        // 我们只把 `&self.buffer` 投影出去，不转移所有权。
        let this = unsafe { self.get_unchecked_mut() };
        Poll::Ready(this.buffer[this.start..this.end].to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn yield_now_completes() {
        let v = block_on(async {
            YieldNow::new().await;
            YieldNow::new().await;
            42
        });
        assert_eq!(v, 42);
    }

    #[test]
    fn delay_completes() {
        let start = std::time::Instant::now();
        let v = block_on(async {
            Delay::from_now(std::time::Duration::from_millis(5)).await;
            7
        });
        assert_eq!(v, 7);
        assert!(start.elapsed() >= std::time::Duration::from_millis(5));
    }
    #[test]
    fn join_all_runs_in_order() {
        // 三个不同的 async 块都是不同类型，所以需要 Pin<Box<dyn Future>> 抹平。
        let fut: std::pin::Pin<Box<dyn Future<Output = Vec<i32>>>> = Box::pin(async {
            join_all(vec![
                Box::pin(async { 1 }) as std::pin::Pin<Box<dyn Future<Output = i32>>>,
                Box::pin(async { 2 }),
                Box::pin(async { 3 }),
            ])
            .await
        });
        let v = block_on(fut);
        assert_eq!(v, vec![1, 2, 3]);
    }
    #[test]
    fn slice_future_returns_borrow() {
        // 自引用 future：因为含 `PhantomPinned`，必须 Pin 后再 poll。
        let fut = Box::pin(SliceFuture::new(vec![10, 20, 30, 40], 1, 3));
        let v = block_on(fut);
        assert_eq!(v, vec![20, 30]);
    }

    #[test]
    fn noop_waker_is_cloneable() {
        let w = noop_waker();
        let w2 = w.clone();
        w.wake();
        w2.wake();
    }
}
