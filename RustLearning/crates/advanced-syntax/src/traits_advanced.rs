//! Advanced trait patterns: object-safety, blanket impls, sealed traits,
//! marker traits, extension traits via newtypes, and `async fn` in traits.

use std::fmt::Debug;
use std::future::Future;

/// Public marker. The actual sealing mechanism (`Sealed`) lives inside a
/// private module so external crates cannot implement it.
pub trait SealedMarker {
    fn sealed_id() -> u32;
}

/// Marker modules hide trait impls from external crates. Within the crate
/// we can implement `Sealed` for our own types; downstream crates cannot
/// add new impls because the trait is private.
mod sealing {
    pub trait Sealed {}
}

/// User-facing sealed trait: types that implement `SealedMarker` AND
/// `sealing::Sealed` are accepted by `privileged`.
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

/// An object-safe trait. The `where Self: Sized` clauses on every method that
/// uses `Self` by value keep the trait object-safe.
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

/// A blanket impl for every `T: Debug` to get a simple log line.
impl<T: Debug + ?Sized> Log for T {
    fn tag(&self) -> &'static str {
        "debug"
    }
}

pub trait Log {
    fn tag(&self) -> &'static str;
}

/// Extension trait pattern: methods added to foreign types via newtype.
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

/// `dyn` dispatch vs. monomorphization: this function takes a trait object
/// to keep code size minimal at the cost of one virtual call per dispatch.
pub fn route(svc: &dyn Service, req: &Request) -> Response {
    svc.handle(req)
}

/// `impl Trait` return: the returned iterator type is hidden, callers cannot
/// name it. This is the cleanest way to return unnameable iterators.
pub fn iter_response(payload: String) -> impl Iterator<Item = u8> {
    payload.into_bytes().into_iter().map(|b| b.wrapping_add(1))
}

/// Static dispatch version: `T` is monomorphized for each concrete type.
pub fn route_static<T: Service>(svc: &T, req: &Request) -> Response {
    svc.handle(req)
}

/// A marker trait with no methods, sometimes called a "trait witness".
pub trait Unit {}

impl Unit for u8 {}
impl Unit for u16 {}
impl Unit for u32 {}

/// `async fn` in trait — edition-2021 native syntax. Educational demo;
/// for library APIs prefer `fn() -> impl Future + Send`.
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

    /// Drive a future on the current thread using a noop waker. Used only in
    /// these tests; demonstrates that `async fn` returns an opaque
    /// `Future`-implementing type.
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
