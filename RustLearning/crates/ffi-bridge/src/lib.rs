//! C ABI 桥接：让 Rust 与 C 在同一进程内互相调用。
//!
//! 本模块覆盖生产代码里最常见的 FFI 模式：
//!
//! 1. **导出函数**：`#[no_mangle] pub extern "C" fn` 让 C 能 dlsym 到。
//! 2. **repr(C) 数据布局**：`#[repr(C)]` 让 Rust 结构体在 C 端有一致的内存布局。
//! 3. **回调函数指针**：C 调用方把函数指针传给 Rust；Rust 通过闭包或 `Box<dyn FnMut>` 包装。
//! 4. **不透明句柄**：用 `*mut T` 在 C 端当 handle，Rust 端维护所有权。
//! 5. **字符串编组**：`CString` / `CStr` 把 Rust 字符串交给 C，反之亦然。
//!
//! 与之配套的 C 头文件在 `include/ffi_bridge.h`；该头文件被本 crate 的
//! 构建脚本测试覆盖（`header_smoke`）。
//!
//! # 安全说明
//!
//! 本模块内所有 `unsafe` 块都标注了 `# Safety` 注释说明调用方必须满足
//! 的前置条件。
//! FFI 模块不可避免要使用 `unsafe`；本 crate 内显式允许。
//!
//! FFI 函数按 ABI 必须接收原始指针；按 clippy 的 `not_unsafe_ptr_arg_deref`
//! 规则又必须被标 `unsafe`，但这些函数已是 `extern "C"` —— 调用方
//! 全部都是非 Rust 代码，"unsafe"标签的语义已经被 ABI 覆盖。直接允许。
#![allow(unsafe_code)]
#![allow(clippy::not_unsafe_ptr_arg_deref)]

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

/// 一个不透明句柄，封装 Rust 侧的 `Box<Vec<i64>>`，给 C 端用。
///
/// # Layout
///
/// `repr(C)` 强制单字段透明布局；`Box<Vec<i64>>` 实际就是一个指针。
#[repr(C)]
pub struct IntVecHandle {
    inner: *mut Vec<i64>,
}

/// # Safety
/// 调用方负责通过 [`int_vec_destroy`] 释放；构造之后指针必须为非空。
unsafe fn handle_to_vec<'a>(h: *const IntVecHandle) -> &'a Vec<i64> {
    debug_assert!(!h.is_null(), "IntVecHandle pointer was null");
    // SAFETY：调用方保证 h 是 int_vec_new 产出的有效指针。
    unsafe { &*(*h).inner }
}

/// # Safety
/// 与 [`handle_to_vec`] 相同；返回可变借用以便 C 端修改元素。
unsafe fn handle_to_vec_mut<'a>(h: *mut IntVecHandle) -> &'a mut Vec<i64> {
    debug_assert!(!h.is_null(), "IntVecHandle pointer was null");
    // SAFETY：调用方保证 h 是 int_vec_new 产出的有效指针。
    unsafe { &mut *(*h).inner }
}
pub extern "C" fn int_vec_new(len: usize) -> *mut IntVecHandle {
    let v = Box::new(Vec::with_capacity(len));
    let h = Box::new(IntVecHandle {
        inner: Box::into_raw(v),
    });
    Box::into_raw(h)
}

/// 释放一个 [`IntVecHandle`] 与其内部 vector。
///
/// # Safety
/// `h` 必须由 [`int_vec_new`] 返回且未被释放。
#[no_mangle]
pub extern "C" fn int_vec_destroy(h: *mut IntVecHandle) {
    if h.is_null() {
        return;
    }
    // SAFETY：调用方承诺 h 由 int_vec_new 返回且未释放。
    let h = unsafe { Box::from_raw(h) };
    // SAFETY：inner 由 Box::into_raw 配对回收。
    let _v = unsafe { Box::from_raw(h.inner) };
    // 两者 drop。
}

/// 获取元素个数。
///
/// # Safety
/// `h` 必须由 [`int_vec_new`] 返回且未被释放。
#[no_mangle]
pub extern "C" fn int_vec_len(h: *const IntVecHandle) -> usize {
    // SAFETY：调用方承诺 h 有效。
    unsafe { handle_to_vec(h) }.len()
}

/// 在末尾 push 一个值。
///
/// # Safety
/// `h` 必须由 [`int_vec_new`] 返回且未被释放。
#[no_mangle]
pub extern "C" fn int_vec_push(h: *mut IntVecHandle, value: i64) {
    // SAFETY：调用方承诺 h 有效。
    unsafe { handle_to_vec_mut(h) }.push(value);
}

/// 取出第 `idx` 个元素。越界返回 0（不 panic）。
///
/// # Safety
/// `h` 必须由 [`int_vec_new`] 返回且未被释放。
#[no_mangle]
pub extern "C" fn int_vec_get(h: *const IntVecHandle, idx: usize) -> i64 {
    // SAFETY：调用方承诺 h 有效。
    unsafe { handle_to_vec(h) }.get(idx).copied().unwrap_or(0)
}

/// 把内部元素求和后返回。
///
/// # Safety
/// `h` 必须由 [`int_vec_new`] 返回且未被释放。
#[no_mangle]
pub extern "C" fn int_vec_sum(h: *const IntVecHandle) -> i64 {
    // SAFETY：调用方承诺 h 有效。
    unsafe { handle_to_vec(h) }.iter().sum()
}

// ---------------------------------------------------------------------------
// 回调
// ---------------------------------------------------------------------------

/// C 端回调签名：`fn(i64) -> i64`。
pub type IntCallback = unsafe extern "C" fn(i64) -> i64;

/// 在 Rust 端用 C 传入的回调对 `h` 中每个元素做变换，原地写回。
///
/// # Safety
/// `h` 必须由 [`int_vec_new`] 返回且未被释放；`cb` 必须是有效的
/// C 端函数指针，调用时需保证它不会发生循环（不要再次调用本函数）。
#[no_mangle]
pub extern "C" fn int_vec_map_inplace(h: *mut IntVecHandle, cb: IntCallback) {
    // SAFETY：调用方承诺 h 有效。
    let v = unsafe { handle_to_vec_mut(h) };
    for x in v.iter_mut() {
        // SAFETY：调用方承诺 cb 合法；调用本身不会保留借用。
        *x = unsafe { cb(*x) };
    }
}

// ---------------------------------------------------------------------------
// 字符串
// ---------------------------------------------------------------------------

/// 把 C 字符串复制一份并以 Rust `String` 形式传出。
///
/// 调用方负责用 [`string_free`] 释放返回的指针。
///
/// # Safety
/// `s` 必须是合法的以 NUL 结尾的 UTF-8 / ASCII 字符串。
#[no_mangle]
pub extern "C" fn string_dup(s: *const c_char) -> *mut c_char {
    if s.is_null() {
        return std::ptr::null_mut();
    }
    // SAFETY：调用方承诺 s 是合法的 C 字符串。
    let cstr = unsafe { CStr::from_ptr(s) };
    let owned = CString::new(cstr.to_bytes()).expect("C string contained NUL");
    owned.into_raw()
}

/// 释放 [`string_dup`] 产出的字符串。
///
/// # Safety
/// `s` 必须由 [`string_dup`] 返回且未被释放；不能是任意 `*mut c_char`。
#[no_mangle]
pub extern "C" fn string_free(s: *mut c_char) {
    if s.is_null() {
        return;
    }
    // SAFETY：调用方承诺 s 由 string_dup 产生。
    let _ = unsafe { CString::from_raw(s) };
}

// ---------------------------------------------------------------------------
// "动态库" 风格：把一个回调注册到全局表，给 C 端做事件订阅
// ---------------------------------------------------------------------------

use std::sync::Mutex;

/// 全局订阅表：键为 u32 事件 id，值为 C 函数指针。
static SUBSCRIBERS: Mutex<Vec<IntCallback>> = Mutex::new(Vec::new());

/// 注册一个回调，返回事件 id（>0）。
///
/// # Safety
/// `cb` 必须是有效的 C 函数指针；其生命周期不得长于本进程。
#[no_mangle]
pub extern "C" fn subscribe(cb: IntCallback) -> u32 {
    let mut g = SUBSCRIBERS.lock().expect("poisoned");
    g.push(cb);
    // 1-based 事件 id，0 留给"未注册"。
    g.len() as u32
}

/// 取消注册某个事件 id。
///
/// # Safety
/// `id` 必须是 [`subscribe`] 的返回值；多次取消同一 id 是 no-op。
#[no_mangle]
pub extern "C" fn unsubscribe(id: u32) {
    let mut g = SUBSCRIBERS.lock().expect("poisoned");
    if id >= 1 {
        let idx = (id - 1) as usize;
        if idx < g.len() {
            g[idx] = default_callback;
        }
    }
}

/// 默认回调：恒等函数。
extern "C" fn default_callback(x: i64) -> i64 {
    x
}

/// 把 `value` 投递给所有订阅者，把所有返回值求和。
///
/// # Safety
/// 调用方必须保证在调用本函数时没有线程正在 [`subscribe`] /
/// [`unsubscribe`] 修改订阅表（使用 [`Mutex`] 已隐式保护）。
#[no_mangle]
pub extern "C" fn dispatch(value: i64) -> i64 {
    let g = SUBSCRIBERS.lock().expect("poisoned");
    let mut total = 0i64;
    for cb in g.iter() {
        // SAFETY：cb 由 subscribe 写入；调用本身不会保留借用。
        total += unsafe { cb(value) };
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ptr;

    extern "C" fn double(x: i64) -> i64 {
        x * 2
    }

    extern "C" fn add_one(x: i64) -> i64 {
        x + 1
    }

    #[test]
    fn handle_round_trip() {
        // SAFETY：独占所有权。
        let h = int_vec_new(4);
        assert_eq!(int_vec_len(h), 0);
        int_vec_push(h, 10);
        int_vec_push(h, 20);
        int_vec_push(h, 30);
        assert_eq!(int_vec_len(h), 3);
        assert_eq!(int_vec_get(h, 0), 10);
        assert_eq!(int_vec_get(h, 1), 20);
        assert_eq!(int_vec_get(h, 2), 30);
        assert_eq!(int_vec_sum(h), 60);
        // SAFETY：独占所有权。
        int_vec_destroy(h);
    }

    #[test]
    fn null_destroy_is_noop() {
        // SAFETY：null 显式允许。
        int_vec_destroy(ptr::null_mut());
    }

    #[test]
    fn map_inplace_applies_callback() {
        // SAFETY：独占所有权。
        let h = int_vec_new(2);
        int_vec_push(h, 1);
        int_vec_push(h, 2);
        int_vec_push(h, 3);
        // SAFETY：double 是合法 C 回调。
        int_vec_map_inplace(h, double);
        assert_eq!(int_vec_get(h, 0), 2);
        assert_eq!(int_vec_get(h, 1), 4);
        assert_eq!(int_vec_get(h, 2), 6);
        // SAFETY：独占所有权。
        int_vec_destroy(h);
    }

    #[test]
    fn string_round_trip() {
        let original = std::ffi::CString::new("hello").unwrap();
        // SAFETY：original 是合法的 C 字符串。
        let dup = string_dup(original.as_ptr());
        assert!(!dup.is_null());
        // SAFETY：dup 由 string_dup 产生。
        let back = unsafe { CStr::from_ptr(dup) };
        assert_eq!(back.to_str().unwrap(), "hello");
        // SAFETY：dup 由 string_dup 产生。
        string_free(dup);
    }

    #[test]
    fn string_dup_null_returns_null() {
        let p = string_dup(ptr::null());
        assert!(p.is_null());
    }

    #[test]
    fn subscribers_dispatch_sums() {
        let id_a = subscribe(add_one);
        let id_b = subscribe(double);
        // SAFETY：dispatch 在持有锁时调用，不会与 subscribe 重入。
        let total = dispatch(5);
        // add_one(5) + double(5) = 6 + 10 = 16。
        assert_eq!(total, 16);
        unsubscribe(id_a);
        unsubscribe(id_b);
        // unsubscribe 把回调替换为 default（恒等），因此再 dispatch
        // 时订阅者仍为两条记录。
        // SAFETY：同前。
        let total2 = dispatch(5);
        assert_eq!(total2, 10); // 5 + 5
    }
}
