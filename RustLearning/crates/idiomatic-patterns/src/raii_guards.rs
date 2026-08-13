//! RAII 守卫：作用域退出时自动执行清理。
//!
//! Rust 中"资源即类型"是核心抽象：只要某资源需要一个清理动作，
//! 就把它和一个实现了 [`Drop`] 的句柄绑定。`Drop::drop` 在值离开
//! 作用域时由编译器自动调用，几乎无法被绕过。
//!
//! 经典场景：
//!
//! - 互斥锁（`MutexGuard`）—— 防止死锁的"自动解锁"。
//! - 文件句柄 —— `File` 关闭。
//! - **追踪 span**：进入/退出日志、自动加/解锁。
//! - **事务**：drop 时回滚未提交的事务。
//!
//! 本模块自己实现一对玩具原语来演示底层机制：
//!
//! 1. [`ScopedCounter`] —— 进入时 `+=1`、退出时 `-=1`。
//! 2. `defer!` 宏 —— 让任何一段代码延迟到作用域结束执行。

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// 引用计数 + 共享原子的 RAII 句柄。
///
/// 每次 [`ScopedCounter::enter`] 都会让内部计数 +1，离开作用域时 -1。
/// 这就是 `tracing::Span::enter` 的简化版本。
#[derive(Debug)]
pub struct ScopedCounter {
    inner: Arc<AtomicUsize>,
}

impl ScopedCounter {
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(AtomicUsize::new(0)),
        }
    }

    #[must_use]
    pub fn current(&self) -> usize {
        self.inner.load(Ordering::SeqCst)
    }

    /// 进入作用域。返回的 guard 在 drop 时让计数 -1。
    pub fn enter(&self) -> ScopedGuard<'_> {
        self.inner.fetch_add(1, Ordering::SeqCst);
        ScopedGuard {
            counter: &self.inner,
        }
    }
}

impl Default for ScopedCounter {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for ScopedCounter {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

/// 与 [`ScopedCounter::enter`] 配对的守卫。
pub struct ScopedGuard<'a> {
    counter: &'a AtomicUsize,
}

impl Drop for ScopedGuard<'_> {
    fn drop(&mut self) {
        self.counter.fetch_sub(1, Ordering::SeqCst);
    }
}

/// 延迟执行：把一段表达式推迟到当前作用域结束时。
///
/// 实现要点：
/// - 利用一个返回 `impl Drop` 的函数把代码"装进" drop 实现里。
/// - `$expr` 会在 drop 时按值求值，因此可以移动捕获。
///
/// # Example
///
/// ```no_run
/// use idiomatic_patterns::defer;
/// use std::cell::RefCell;
/// let log = RefCell::new(Vec::new());
/// {
///     log.borrow_mut().push("enter");
///     defer!(log.borrow_mut().push("leave"););
///     log.borrow_mut().push("body");
/// }
/// assert_eq!(*log.borrow(), vec!["enter", "body", "leave"]);
/// ```
#[macro_export]
macro_rules! defer {
    ($($tt:tt)*) => {
        let _guard = $crate::raii_guards::DeferGuard::_new(|| { $($tt)* });
    };
}

#[doc(hidden)]
pub struct DeferGuard<F>
where
    F: FnOnce(),
{
    f: Option<F>,
}

impl<F> DeferGuard<F>
where
    F: FnOnce(),
{
    #[must_use]
    pub fn _new(f: F) -> Self {
        Self { f: Some(f) }
    }
}

impl<F> Drop for DeferGuard<F>
where
    F: FnOnce(),
{
    fn drop(&mut self) {
        if let Some(f) = self.f.take() {
            f();
        }
    }
}

/// 一个不可重入的互斥锁的玩具实现，用来演示 RAII 解锁。
///
/// 真实项目请使用 [`std::sync::Mutex`]；本类型仅用于教学。
#[derive(Debug)]
pub struct ToyMutex {
    locked: std::cell::Cell<bool>,
}

impl ToyMutex {
    #[must_use]
    pub fn new() -> Self {
        Self {
            locked: std::cell::Cell::new(false),
        }
    }

    pub fn lock(&self) -> ToyMutexGuard<'_> {
        assert!(!self.locked.get(), "ToyMutex 是不可重入的，且不支持并发");
        self.locked.set(true);
        ToyMutexGuard { mutex: self }
    }
}

impl Default for ToyMutex {
    fn default() -> Self {
        Self::new()
    }
}

pub struct ToyMutexGuard<'a> {
    mutex: &'a ToyMutex,
}

impl Drop for ToyMutexGuard<'_> {
    fn drop(&mut self) {
        self.mutex.locked.set(false);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scoped_counter_balances() {
        let counter = ScopedCounter::new();
        assert_eq!(counter.current(), 0);
        {
            let _g1 = counter.enter();
            assert_eq!(counter.current(), 1);
            {
                let _g2 = counter.enter();
                assert_eq!(counter.current(), 2);
            }
            assert_eq!(counter.current(), 1);
        }
        assert_eq!(counter.current(), 0);
    }

    #[test]
    fn scoped_counter_is_cloneable_and_shared() {
        let a = ScopedCounter::new();
        let b = a.clone();
        let _g = b.enter();
        assert_eq!(a.current(), 1);
    }

    #[test]
    fn defer_runs_at_scope_end() {
        use crate::defer;
        use std::cell::RefCell;
        let log = RefCell::new(Vec::new());
        {
            log.borrow_mut().push("enter");
            defer!(log.borrow_mut().push("leave"););
            log.borrow_mut().push("body");
        }
        assert_eq!(*log.borrow(), vec!["enter", "body", "leave"]);
    }

    #[test]
    fn defer_runs_lifo_for_multiple() {
        use crate::defer;
        use std::cell::RefCell;
        let log = RefCell::new(Vec::new());
        {
            defer!(log.borrow_mut().push("first"););
            defer!(log.borrow_mut().push("second"););
        }
        // 后 defer 的先 drop，因此先执行。
        assert_eq!(*log.borrow(), vec!["second", "first"]);
    }

    #[test]
    fn toy_mutex_releases_on_drop() {
        let m = ToyMutex::new();
        {
            let _g = m.lock();
            // 持锁中：再次锁会 panic；这里只验证 drop 之后能再锁。
        }
        let _g = m.lock();
    }
}
