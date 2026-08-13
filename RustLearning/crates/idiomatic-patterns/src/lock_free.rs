//! 无锁原语：`Arc<Atomic*>` 模式与发布语义。
//!
//! Rust 的 `Arc<T>` 提供线程间共享所有权；当 `T` 本身是原子类型时，
//! 整个数据结构就具备**无锁共享**的能力——这是构建计数器、注册表、广播
//! 通道的基石。
//!
//! 本模块展示三个工业级模式：
//!
//! 1. **共享计数器** —— `Arc<AtomicUsize>` 是最常见的形态。
//! 2. **指标注册表** —— 名称到原子计数的多读单写 map。
//! 3. **一次性初始化** —— `std::sync::LazyLock` 比 `lazy_static` 更安全。
//!
//! # 与 `OnceLock` 的选择
//!
//! - 初始化逻辑在声明点已经确定：优先 [`std::sync::LazyLock`]。
//! - 初始化需要运行时输入（配置、URL 等）：用 [`std::sync::OnceLock`]。
//!
//! 本模块两个示例分别对应这两种用法。
use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// 1. 共享计数器
// ---------------------------------------------------------------------------

/// 全局请求计数器。每个 HTTP 处理器克隆一份 `Arc` 即可递增。
#[derive(Debug, Default)]
pub struct RequestCounter {
    inner: AtomicUsize,
}

impl RequestCounter {
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: AtomicUsize::new(0),
        }
    }

    pub fn inc(&self) -> usize {
        // `fetch_add` 返回**旧**值；这是最常见的"先增再读"模式。
        self.inner.fetch_add(1, Ordering::Relaxed)
    }

    #[must_use]
    pub fn get(&self) -> usize {
        self.inner.load(Ordering::Relaxed)
    }
}

/// 用 [`Arc`] 包装，让计数器在多线程间共享。
#[must_use]
pub fn shared_counter() -> Arc<RequestCounter> {
    Arc::new(RequestCounter::new())
}

// ---------------------------------------------------------------------------
// 2. 指标注册表
// ---------------------------------------------------------------------------

/// 一个非常小的指标注册表：按名称记录 `i64` 累计值与最后更新时间。
///
/// 真实项目会用 `metrics` / `prometheus` crate；这里保留手写版以演示
/// `Mutex<HashMap>` 与 `Arc` 的组合。
#[derive(Debug, Default)]
pub struct Metrics {
    counters: Mutex<HashMap<String, Arc<AtomicI64>>>,
}

impl Metrics {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// 获取（或创建）一个命名计数器。
    pub fn counter(&self, name: &str) -> Arc<AtomicI64> {
        let mut g = self.counters.lock().expect("poisoned");
        g.entry(name.to_owned())
            .or_insert_with(|| Arc::new(AtomicI64::new(0)))
            .clone()
    }

    /// 给名称增加 delta，返回新值。
    pub fn add(&self, name: &str, delta: i64) -> i64 {
        let c = self.counter(name);
        c.fetch_add(delta, Ordering::Relaxed) + delta
    }

    /// 复制所有计数器的当前值。
    #[must_use]
    pub fn snapshot(&self) -> HashMap<String, i64> {
        let g = self.counters.lock().expect("poisoned");
        g.iter()
            .map(|(k, v)| (k.clone(), v.load(Ordering::Relaxed)))
            .collect()
    }
}

// ---------------------------------------------------------------------------
// 3. 一次性初始化
// ---------------------------------------------------------------------------

/// 一个进程级缓存：第一次调用 `now_millis` 时初始化基准时间，
/// 之后所有线程都通过原子读拿到一致结果。
///
/// 使用 [`std::sync::LazyLock`]：初始化逻辑在声明点确定，
/// 比起 `OnceLock::get_or_init` 少一层函数包装。
pub fn process_start_millis() -> u64 {
    use std::sync::LazyLock;
    static START: LazyLock<u64> = LazyLock::new(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as u64)
    });
    *START
}

#[must_use]
pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

// ---------------------------------------------------------------------------
// 4. 原子发布：用 release/acquire 配对完成"先发后读"
// ---------------------------------------------------------------------------

/// 演示 release/acquire 配对：生产者写入 payload + 标记位（release），
/// 消费者读标记位（acquire）后必然看到 payload。
use std::sync::atomic::AtomicBool;

#[derive(Debug, Default)]
pub struct Slot<T> {
    ready: AtomicBool,
    value: std::sync::Mutex<Option<T>>,
}

impl<T: Default> Slot<T> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            ready: AtomicBool::new(false),
            value: std::sync::Mutex::new(None),
        }
    }

    /// 发布一个新值。调用方传入的值会被移动进 [`Slot`]。
    pub fn publish(&self, value: T) {
        let mut g = self.value.lock().expect("poisoned");
        *g = Some(value);
        // release：之前的所有写入对后续 acquire 可见。
        self.ready.store(true, Ordering::Release);
    }

    /// 尝试读取最新值。仅当已经发布过才返回 `Some`。
    #[must_use]
    pub fn try_load(&self) -> Option<T>
    where
        T: Clone,
    {
        if self.ready.load(Ordering::Acquire) {
            let g = self.value.lock().expect("poisoned");
            g.clone()
        } else {
            None
        }
    }
}

/// 单调递增时钟：单调计数器（`AtomicU64`）+ 起始时间（一次性初始化）。
#[derive(Debug)]
pub struct MonotonicClock {
    counter: AtomicU64,
    start_ns: u64,
}

impl MonotonicClock {
    #[must_use]
    pub fn new() -> Self {
        let start_ns = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos() as u64);
        Self {
            counter: AtomicU64::new(0),
            start_ns,
        }
    }

    pub fn tick(&self) -> u64 {
        self.counter.fetch_add(1, Ordering::Relaxed)
    }

    #[must_use]
    pub fn elapsed_ns(&self) -> u64 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos() as u64);
        now.saturating_sub(self.start_ns)
    }
}

impl Default for MonotonicClock {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn shared_counter_increments_across_threads() {
        let counter = shared_counter();
        let mut handles = Vec::new();
        for _ in 0..8 {
            let c = Arc::clone(&counter);
            handles.push(thread::spawn(move || {
                for _ in 0..100 {
                    c.inc();
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(counter.get(), 800);
    }

    #[test]
    fn metrics_registry_collects_named_counters() {
        let m = Metrics::new();
        m.add("http.get", 1);
        m.add("http.get", 1);
        m.add("http.post", 3);
        let snap = m.snapshot();
        assert_eq!(snap.get("http.get"), Some(&2));
        assert_eq!(snap.get("http.post"), Some(&3));
    }

    #[test]
    fn once_lock_initialises_once() {
        // 多次调用拿到的都是同一个值（且不会重复初始化）。
        let a = process_start_millis();
        let b = process_start_millis();
        assert_eq!(a, b);
        assert!(a > 0);
    }

    #[test]
    fn slot_publish_then_load() {
        let slot: Slot<u32> = Slot::new();
        assert_eq!(slot.try_load(), None);
        slot.publish(42);
        assert_eq!(slot.try_load(), Some(42));
    }

    #[test]
    fn monotonic_clock_counts() {
        let c = MonotonicClock::new();
        assert_eq!(c.tick(), 0);
        assert_eq!(c.tick(), 1);
        assert!(c.elapsed_ns() < 1_000_000_000);
    }
}
