//! 高级 trait 模式：对象安全、覆盖式 impl、封闭 trait、
//! 标记 trait、通过 newtype 实现的扩展 trait，以及 trait 中的 `async fn`。

use std::fmt::Debug;
use std::future::Future;

/// 公共标记。实际的封闭机制（`Sealed`）位于私有模块中，
/// 外部 crate 无法为其实现。
pub trait SealedMarker {
    fn sealed_id() -> u32;
}

/// 标记模块用于隐藏外部 crate 的 trait 实现。在本 crate 内部，
/// 我们可以为自有类型实现 `Sealed`；因为该 trait 是私有的，
/// 下游 crate 无法新增实现。
mod sealing {
    pub trait Sealed {}
}

/// 用户面对的封闭 trait：实现了 `SealedMarker` 与 `sealing::Sealed` 的类型
/// 才能被 `privileged` 接受。
pub fn privileged<T: SealedMarker + sealing::Sealed>() -> u32 {
    T::sealed_id()
}

pub struct Admin;
pub struct Guest;

impl SealedMarker for Admin {
    fn sealed_id() -> u32 {
        42
    }
}

impl SealedMarker for Guest {
    fn sealed_id() -> u32 {
        42
    }
}

impl sealing::Sealed for Admin {}
impl sealing::Sealed for Guest {}

/// 一个对象安全的 trait。每个按值使用 `Self` 的方法都加上
/// `where Self: Sized` 子句，从而保证该 trait 是对象安全的。
pub trait Service {
    fn handle(&self, req: &Request) -> Response;
    fn name(&self) -> &str;
}

#[derive(Debug, Clone)]
pub struct Request {
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Response {
    pub status: u16,
    pub payload: String,
}

/// 为所有 `T: Debug` 提供一个简单的日志行 —— 这是一个覆盖式 impl。
impl<T: Debug + ?Sized> Log for T {
    fn tag(&self) -> &'static str {
        "debug"
    }
}

pub trait Log {
    fn tag(&self) -> &'static str;
}

/// 扩展 trait 模式：通过 newtype 向外部类型添加方法。
pub trait StrExt {
    fn truncate_to(&self, n: usize) -> &str;
}

impl StrExt for str {
    fn truncate_to(&self, n: usize) -> &str {
        let end = self
            .char_indices()
            .nth(n)
            .map(|(idx, _)| idx)
            .unwrap_or(self.len());
        &self[..end]
    }
}

/// `dyn` 调度 vs. 单态化：本函数接受一个 trait 对象，
/// 代价是每次分发多一次虚函数调用，但能保持代码体积较小。
pub fn route(svc: &dyn Service, req: &Request) -> Response {
    svc.handle(req)
}

/// `impl Trait` 返回：返回的迭代器类型被隐藏，调用方无法命名它。
/// 这是返回“不可命名”迭代器的最干净方式。
pub fn iter_response(payload: String) -> impl Iterator<Item = u8> {
    payload.into_bytes().into_iter().map(|b| b.wrapping_add(1))
}

/// 静态分发版本：每个具体类型都会对 `T` 进行单态化。
pub fn route_static<T: Service>(svc: &T, req: &Request) -> Response {
    svc.handle(req)
}

/// 一种没有任何方法的标记 trait，有时被称为“trait 见证”。
pub trait Unit {}

impl Unit for u8 {}
impl Unit for u16 {}
impl Unit for u32 {}

/// trait 中的 `async fn` —— edition-2021 的原生语法。教学示例；
/// 对于库 API，建议优先使用 `fn() -> impl Future + Send`。
#[allow(async_fn_in_trait)]
pub trait AsyncLoader {
    async fn load(&self) -> Response;
}

pub struct StaticLoader;

impl AsyncLoader for StaticLoader {
    async fn load(&self) -> Response {
        Response {
            status: 200,
            payload: "static".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sealed_marker_works() {
        assert_eq!(privileged::<Admin>(), 42);
        assert_eq!(privileged::<Guest>(), 42);
    }

    #[test]
    fn blanket_log_works_for_any_debug() {
        assert_eq!(42.tag(), "debug");
        assert_eq!("hi".tag(), "debug");
    }

    #[test]
    fn str_ext_truncates_at_n_chars() {
        assert_eq!("hello世界".truncate_to(5), "hello");
        assert_eq!("abc".truncate_to(5), "abc");
    }

    #[test]
    fn iter_response_decodes() {
        let collected: Vec<u8> = iter_response(String::from("abc")).collect();
        assert_eq!(collected, vec![98, 99, 100]);
    }

    #[test]
    fn async_loader_returns_response() {
        let fut = StaticLoader.load();
        let out = futures_lite_block_on(fut);
        assert_eq!(out.status, 200);
    }

    /// 在当前线程上使用 noop waker 来驱动一个 Future。仅用于这些测试；
    /// 用以演示 `async fn` 返回的是一个实现了 `Future` 的不透明类型。
    fn futures_lite_block_on<F: Future>(f: F) -> F::Output {
        use std::sync::Arc;
        use std::task::{Context, Poll, Wake, Waker};

        struct EmptyWake;
        impl Wake for EmptyWake {
            fn wake(self: Arc<Self>) {}
        }

        let waker = Arc::new(EmptyWake).into();
        let mut f = Box::pin(f);
        let mut cx = Context::from_waker(&waker);
        loop {
            if let Poll::Ready(v) = f.as_mut().poll(&mut cx) {
                return v;
            }
            std::thread::yield_now();
        }
    }
}
