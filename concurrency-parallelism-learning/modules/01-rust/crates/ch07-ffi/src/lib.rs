//! Ch07 — exposing a Rust thread pool over the C ABI.
//!
//! The C header lives in `include/cp_pool.h`. The Rust side is a
//! re-export of `ch01-threads` plus a `cp_pool` opaque type, mirroring
//! the shape of a typical C concurrency library.
//!
//! SAFETY: all `extern "C"` functions must be thread-safe, must not
//! panic across the FFI boundary, and must not hold a `Mutex` across
//! an FFI call.

use std::os::raw::c_int;
use std::sync::Arc;

mod pool {
    use std::sync::{Condvar, Mutex};
    use std::sync::atomic::{AtomicBool, Ordering};

    type Task = Box<dyn FnOnce() + Send + 'static>;

    pub struct Pool {
        threads: Vec<std::thread::JoinHandle<()>>,
        state: Arc<(Mutex<Vec<Task>>, Condvar, AtomicBool)>,
    }

    impl Pool {
        pub fn new(n: usize) -> Self {
            let state = Arc::new((
                Mutex::new(Vec::new()),
                Condvar::new(),
                AtomicBool::new(false),
            ));
            let mut threads = Vec::with_capacity(n);
            for i in 0..n {
                let st = Arc::clone(&state);
                threads.push(std::thread::spawn(move || worker(st, i)));
            }
            Pool { threads, state }
        }

        pub fn submit(&self, t: Task) {
            let (q, cv, _) = &*self.state;
            let mut g = q.lock().unwrap();
            g.push(t);
            cv.notify_one();
        }

        pub fn shutdown(self) {
            let (_, cv, shutdown) = &*self.state;
            shutdown.store(true, Ordering::SeqCst);
            cv.notify_all();
            for t in self.threads {
                let _ = t.join();
            }
        }
    }

    fn worker(state: Arc<(Mutex<Vec<Task>>, Condvar, AtomicBool)>, id: usize) {
        let (q, cv, shutdown) = &*state;
        loop {
            let task = {
                let mut g = q.lock().unwrap();
                loop {
                    if let Some(t) = g.pop() {
                        break t;
                    }
                    if shutdown.load(Ordering::SeqCst) {
                        return;
                    }
                    g = cv.wait(g).unwrap();
                }
            };
            task();
            // poison the id to silence the unused warning
            let _ = id;
        }
    }
}

/// Opaque handle exposed to C.
pub struct cp_pool_t { inner: pool::Pool }

/// Create a pool with `n_threads` worker threads.
#[no_mangle]
pub extern "C" fn cp_pool_new(n_threads: c_int) -> *mut cp_pool_t {
    if n_threads < 1 { return std::ptr::null_mut(); }
    let p = Box::new(cp_pool_t { inner: pool::Pool::new(n_threads as usize) });
    Box::into_raw(p)
}

/// Submit a C function pointer + opaque user data.
/// The function is called on a worker thread.
/// SAFETY: `fn_` must be thread-safe and not panic.
#[no_mangle]
pub extern "C" fn cp_pool_submit(pool: *mut cp_pool_t, fn_: Option<extern "C" fn(*mut std::ffi::c_void)>, arg: *mut std::ffi::c_void) -> c_int {
    if pool.is_null() { return -1; }
    let p = unsafe { &*pool };
    let f = match fn_ {
        Some(f) => f,
        None => return -2,
    };
    p.inner.submit(Box::new(move || f(arg)));
    0
}

/// Shut down the pool; join all workers. The handle is consumed.
#[no_mangle]
pub extern "C" fn cp_pool_shutdown(pool: *mut cp_pool_t) {
    if pool.is_null() { return; }
    let p = unsafe { Box::from_raw(pool) };
    p.inner.shutdown();
}

/// Run a closure on the calling thread (for tests).
#[cfg(test)]
pub fn run_inline<F: FnOnce() + Send + 'static>(f: F) {
    f();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static CALL_COUNT: AtomicUsize = AtomicUsize::new(0);
    extern "C" fn trampoline(_arg: *mut std::ffi::c_void) {
        CALL_COUNT.fetch_add(1, Ordering::SeqCst);
    }

    #[test]
    fn ffi_pool_submits_and_shuts_down() {
        CALL_COUNT.store(0, Ordering::SeqCst);
        let p = cp_pool_new(2);
        for _ in 0..10 {
            cp_pool_submit(p, Some(trampoline), std::ptr::null_mut());
        }
        // wait briefly for completion (no barrier in this API; we sleep)
        std::thread::sleep(std::time::Duration::from_millis(50));
        cp_pool_shutdown(p);
        assert_eq!(CALL_COUNT.load(Ordering::SeqCst), 10);
    }
}
