//! `unsafe` building blocks: raw pointers, `MaybeUninit`, manual `Drop`,
//! `NonNull`, intrusive lists, aliasing rules.
//!
//! `unsafe` is justified in this module because the patterns rely on it; the
//! safety invariants are documented at each function.

#![allow(unsafe_code)]

use std::alloc::{alloc, dealloc, Layout};
use std::mem::MaybeUninit;
use std::ptr::{self, NonNull};

/// A small owned buffer allocated via `std::alloc::alloc`, mirroring how a
/// minimal `Box<T>` is laid out. Demonstrates Layout handling and manual
/// `Drop`.
///
/// # Safety
///
/// The `Buf<T>` owns exactly one `T` at address `self.ptr`. Once allocated,
/// the value is in an uninitialized state until `write` is called. After
/// `write`, the value is dropped by `Buf`'s own `Drop` impl; calling `read`
/// takes ownership and prevents the inner drop from running. The `written`
/// flag makes the drop ordering correct for any `T`.
pub struct Buf<T> {
    ptr: NonNull<T>,
    written: bool,
}

impl<T> Buf<T> {
    /// Allocates uninitialized memory. The cell is logically empty.
    pub fn new_uninit() -> Self {
        let layout = Layout::new::<T>();
        assert!(layout.size() != 0, "ZST not supported here");
        // SAFETY: layout non-zero and we own the allocation immediately.
        let raw = unsafe { alloc(layout) as *mut T };
        let nn = NonNull::new(raw).expect("alloc failure");
        Self { ptr: nn, written: false }
    }

    /// Initializes the cell with `value`. Panics if the cell was already
    /// written.
    pub fn write(&mut self, value: T) {
        assert!(!self.written, "Buf::write called twice");
        // SAFETY: caller invariant: the slot is uninitialized and we own it.
        unsafe { ptr::write(self.ptr.as_ptr(), value) };
        self.written = true;
    }

    /// # Safety
    /// The cell must already contain a value written by `write`.
    pub unsafe fn read(&mut self) -> T {
        assert!(self.written, "Buf::read on uninitialized cell");
        // SAFETY: caller guarantees initialized memory.
        let v = unsafe { ptr::read(self.ptr.as_ptr()) };
        self.written = false;
        v
    }

    /// Borrows the contained value immutably. Pointer must be initialized
    /// and live.
    pub fn as_ref(&self) -> &T {
        assert!(self.written, "Buf::as_ref on uninitialized cell");
        // SAFETY: invariant of `Buf`.
        unsafe { self.ptr.as_ref() }
    }
}

impl<T> Drop for Buf<T> {
    fn drop(&mut self) {
        let layout = Layout::new::<T>();
        if layout.size() != 0 {
            if self.written {
                // SAFETY: `written` is true, so the slot has a valid `T`.
                unsafe { ptr::drop_in_place(self.ptr.as_ptr()) };
            }
            // SAFETY: caller invariant: we own this allocation.
            unsafe { dealloc(self.ptr.as_ptr() as *mut u8, layout) };
        }
    }
}

/// A stack-allocated fixed-size array helper that demonstrates
/// `MaybeUninit` and initializing in place.
pub fn in_place_sum<const N: usize>(inputs: [u8; N]) -> u32 {
    // SAFETY: `[MaybeUninit<u32>; N]`, then we initialize each slot before
    // transmuting back to `[u32; N]`.
    let mut buf: [MaybeUninit<u32>; N] = [MaybeUninit::uninit(); N];
    for (i, b) in buf.iter_mut().enumerate() {
        b.write(inputs[i] as u32);
    }
    // SAFETY: every slot was written above.
    let arr: [u32; N] = unsafe { buf.map(|m| m.assume_init()) };
    arr.into_iter().sum()
}

/// A singly-linked list storing the *next* pointer inside the node. Models
/// `std::collections::LinkedList`'s internals without `Rc`/`RefCell`.
pub struct IntrusiveNode<T> {
    pub value: T,
    pub next: Option<NonNull<IntrusiveNode<T>>>,
}

pub struct IntrusiveList<T> {
    head: Option<NonNull<IntrusiveNode<T>>>,
}

impl<T> IntrusiveList<T> {
    pub const fn new() -> Self {
        Self { head: None }
    }

    /// Pushes a value, taking ownership of an already-allocated node.
    ///
    /// # Safety
    /// `node` must be a non-null pointer to a valid `IntrusiveNode<T>` not
    /// already linked into another list.
    pub unsafe fn push(&mut self, node: NonNull<IntrusiveNode<T>>) {
        // SAFETY: caller guarantees node is alive and unlinked.
        unsafe {
            (*node.as_ptr()).next = self.head;
        }
        self.head = Some(node);
    }

    /// Peeks at the head without linking.
    pub fn peek(&self) -> Option<&T> {
        // SAFETY: `head`, if Some, points to a live node we own as long as
        // the list lives.
        unsafe { self.head.map(|n| &(*n.as_ptr()).value) }
    }

    pub fn pop(&mut self) -> Option<NonNull<IntrusiveNode<T>>> {
        self.head.take().map(|node| {
            // SAFETY: invariant: head was the live top.
            self.head = unsafe { (*node.as_ptr()).next };
            node
        })
    }

    pub fn len(&self) -> usize {
        let mut count = 0;
        let mut cur = self.head;
        while let Some(p) = cur {
            // SAFETY: list invariant guarantees nodes are alive.
            count += 1;
            cur = unsafe { (*p.as_ptr()).next };
        }
        count
    }
}

impl<T> Default for IntrusiveList<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// Demonstrates `unsafe` raw-pointer arithmetic and reads.
///
/// # Safety
/// `ptr` must be aligned and non-null, and the region `[ptr, ptr+length)`
/// must be valid for reads for the duration of the call.
pub unsafe fn raw_sum(ptr: *const u32, length: usize) -> u64 {
    let mut acc: u64 = 0;
    for i in 0..length {
        // SAFETY: caller guarantees the range.
        unsafe {
            acc += *ptr.add(i) as u64;
        }
    }
    acc
}

/// A safe wrapping constructor that validates before touching unsafe code.
pub fn checked_sum(slice: &[u32]) -> Option<u64> {
    if slice.is_empty() {
        return Some(0);
    }
    // Pointer alignment: the address must be a multiple of the alignment
    // of `u32`. `pointer_is_aligned_to` is unstable, so we use modular
    // arithmetic.
    let align = core::mem::align_of::<u32>() as usize;
    if (slice.as_ptr() as usize) % align != 0 {
        return None;
    }
    // SAFETY: non-empty + aligned + caller owns the slice.
    Some(unsafe { raw_sum(slice.as_ptr(), slice.len()) })
}

/// A small helper that allocates an intrusive node on the heap. Returns a
/// `NonNull` to the node; ownership transfers to the caller.
///
/// # Safety
/// Caller must ensure the returned pointer is eventually deallocated with
/// `dealloc_node` and that the node is removed from any list before drop.
pub unsafe fn alloc_node<T>(value: T) -> NonNull<IntrusiveNode<T>> {
    let layout = Layout::new::<IntrusiveNode<T>>();
    let raw = unsafe { alloc(layout) as *mut IntrusiveNode<T> };
    let nn = NonNull::new(raw).expect("alloc failure");
    // SAFETY: we just allocated, so the memory is uninitialized but valid.
    unsafe {
        ptr::write(nn.as_ptr(), IntrusiveNode { value, next: None });
    }
    nn
}

/// # Safety
/// Caller must ensure the node is no longer linked and no other references
/// alias it.
pub unsafe fn dealloc_node<T>(node: NonNull<IntrusiveNode<T>>) {
    let layout = Layout::new::<IntrusiveNode<T>>();
    // SAFETY: caller guarantees the node is detached and not aliased.
    unsafe {
        ptr::drop_in_place(node.as_ptr());
        dealloc(node.as_ptr() as *mut u8, layout);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maybe_uninit_init_in_place() {
        assert_eq!(in_place_sum::<3>([1, 2, 3]), 6);
    }

    #[test]
    fn intrusive_list_lifo() {
        let mut list = IntrusiveList::<i32>::new();
        // SAFETY: we own the returned nodes and remove them before dealloc.
        let n2 = unsafe { alloc_node(20) };
        let n1 = unsafe { alloc_node(10) };
        unsafe {
            list.push(n1);
            list.push(n2);
        }
        assert_eq!(list.peek(), Some(&20));
        assert_eq!(list.len(), 2);
        // SAFETY: nodes are owned exclusively by this test scope.
        let popped = list.pop().unwrap();
        unsafe { dealloc_node(popped) };
        let popped = list.pop().unwrap();
        unsafe { dealloc_node(popped) };
        assert!(list.peek().is_none());
    }

    #[test]
    fn checked_sum_works() {
        let v = [1u32, 2, 3, 4];
        assert_eq!(checked_sum(&v), Some(10));
    }

    #[test]
    fn buf_drops_value_properly() {
        let mut buf = Buf::<String>::new_uninit();
        buf.write(String::from("hello"));
        assert_eq!(buf.as_ref(), "hello");
        // SAFETY: writes are tracked.
        let s = unsafe { buf.read() };
        assert_eq!(s, "hello");
    }
}
