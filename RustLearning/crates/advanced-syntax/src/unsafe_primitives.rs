//! `unsafe` 基础构件：裸指针、`MaybeUninit`、手工 `Drop`、
//! `NonNull`、侵入式链表、别名规则。
//!
//! 本模块使用 `unsafe` 是因为这些模式本身就依赖它；
//! 安全性不变量在每个函数处都有文档说明。

#![allow(unsafe_code)]

use std::alloc::{alloc, dealloc, Layout};
use std::mem::MaybeUninit;
use std::ptr::{self, NonNull};

/// 一个通过 `std::alloc::alloc` 分配的、模拟最小 `Box<T>` 布局的小型拥有缓冲区。
/// 用以演示 Layout 的处理与手工 `Drop`。
///
/// # Safety
///
/// `Buf<T>` 在 `self.ptr` 地址上恰好持有一个 `T`。一旦分配完成，
/// 该值处于未初始化状态，直到调用 `write`。调用 `write` 后，
/// 该值由 `Buf` 自带的 `Drop` 实现负责 drop；
/// 调用 `read` 会取得所有权并阻止内部 drop 的运行。
/// `written` 标志使得任何 `T` 的 drop 顺序都是正确的。
pub struct Buf<T> {
    ptr: NonNull<T>,
    written: bool,
}

impl<T> Buf<T> {
    /// 分配未初始化的内存。该单元逻辑上为空。
    pub fn new_uninit() -> Self {
        let layout = Layout::new::<T>();
        assert!(layout.size() != 0, "ZST not supported here");
        // SAFETY：layout 非零，且我们立即拥有该分配。
        let raw = unsafe { alloc(layout) as *mut T };
        let nn = NonNull::new(raw).expect("alloc failure");
        Self { ptr: nn, written: false }
    }

    /// 使用 `value` 初始化该单元。若单元已被写入则会发生 panic。
    pub fn write(&mut self, value: T) {
        assert!(!self.written, "Buf::write called twice");
        // SAFETY：调用者不变量：该槽位未初始化，且我们拥有它。
        unsafe { ptr::write(self.ptr.as_ptr(), value) };
        self.written = true;
    }

    /// # Safety
    /// 该单元必须已经通过 `write` 写入了值。
    pub unsafe fn read(&mut self) -> T {
        assert!(self.written, "Buf::read on uninitialized cell");
        // SAFETY：调用者保证内存已被初始化。
        let v = unsafe { ptr::read(self.ptr.as_ptr()) };
        self.written = false;
        v
    }

    /// 不可变地借用所包含的值。指针必须已被初始化且存活。
    pub fn as_ref(&self) -> &T {
        assert!(self.written, "Buf::as_ref on uninitialized cell");
        // SAFETY：`Buf` 的不变量。
        unsafe { self.ptr.as_ref() }
    }
}

impl<T> Drop for Buf<T> {
    fn drop(&mut self) {
        let layout = Layout::new::<T>();
        if layout.size() != 0 {
            if self.written {
                // SAFETY：`written` 为真，因此该槽位拥有一个有效的 `T`。
                unsafe { ptr::drop_in_place(self.ptr.as_ptr()) };
            }
            // SAFETY：调用者不变量：我们拥有该分配。
            unsafe { dealloc(self.ptr.as_ptr() as *mut u8, layout) };
        }
    }
}

/// 一个栈上分配的、容量固定的数组辅助函数，
/// 用以演示 `MaybeUninit` 与原地初始化。
pub fn in_place_sum<const N: usize>(inputs: [u8; N]) -> u32 {
    // SAFETY：`[MaybeUninit<u32>; N]`，随后在转换回 `[u32; N]` 之前
    // 我们会初始化每一个槽位。
    let mut buf: [MaybeUninit<u32>; N] = [MaybeUninit::uninit(); N];
    for (i, b) in buf.iter_mut().enumerate() {
        b.write(inputs[i] as u32);
    }
    // SAFETY：每个槽位都已在上面写入。
    let arr: [u32; N] = unsafe { buf.map(|m| m.assume_init()) };
    arr.into_iter().sum()
}

/// 一个在节点内部存放 `next` 指针的单向链表。
/// 模拟 `std::collections::LinkedList` 的内部结构，但不使用 `Rc`/`RefCell`。
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

    /// 推入一个值，取得一个已经分配的节点的所有权。
    ///
    /// # Safety
    /// `node` 必须是一个非空指针，指向一个合法的 `IntrusiveNode<T>`，
    /// 且尚未被链接到其他链表中。
    pub unsafe fn push(&mut self, node: NonNull<IntrusiveNode<T>>) {
        // SAFETY：调用者保证节点存活且未链接。
        unsafe {
            (*node.as_ptr()).next = self.head;
        }
        self.head = Some(node);
    }

    /// 在不取消链接的情况下查看头部。
    pub fn peek(&self) -> Option<&T> {
        // SAFETY：只要链表存活，其 `head`（若为 Some）
        // 指向的节点我们也始终拥有。
        unsafe { self.head.map(|n| &(*n.as_ptr()).value) }
    }

    pub fn pop(&mut self) -> Option<NonNull<IntrusiveNode<T>>> {
        self.head.take().map(|node| {
            // SAFETY：不变量：head 是当前活跃的顶部。
            self.head = unsafe { (*node.as_ptr()).next };
            node
        })
    }

    pub fn len(&self) -> usize {
        let mut count = 0;
        let mut cur = self.head;
        while let Some(p) = cur {
            // SAFETY：链表不变量保证节点始终存活。
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

/// 演示 `unsafe` 的裸指针算术与读取。
///
/// # Safety
/// `ptr` 必须对齐且非空，区间 `[ptr, ptr+length)` 在调用期间
/// 必须对读取有效。
pub unsafe fn raw_sum(ptr: *const u32, length: usize) -> u64 {
    let mut acc: u64 = 0;
    for i in 0..length {
        // SAFETY：调用者保证该区间的合法性。
        unsafe {
            acc += *ptr.add(i) as u64;
        }
    }
    acc
}

/// 一个安全的包装构造函数，会在使用 unsafe 代码前进行校验。
pub fn checked_sum(slice: &[u32]) -> Option<u64> {
    if slice.is_empty() {
        return Some(0);
    }
    // 指针对齐：地址必须是 `u32` 对齐值的整数倍。
    // `pointer_is_aligned_to` 还不稳定，因此这里使用模运算。
    let align = core::mem::align_of::<u32>() as usize;
    if (slice.as_ptr() as usize) % align != 0 {
        return None;
    }
    // SAFETY：非空 + 对齐 + 调用者拥有该切片。
    Some(unsafe { raw_sum(slice.as_ptr(), slice.len()) })
}

/// 在堆上分配一个侵入式节点的小辅助函数。返回一个指向该节点的
/// `NonNull`；所有权转移给调用者。
///
/// # Safety
/// 调用者必须确保返回的指针最终通过 `dealloc_node` 释放，
/// 并且在 drop 之前已经从任何链表中移除。
pub unsafe fn alloc_node<T>(value: T) -> NonNull<IntrusiveNode<T>> {
    let layout = Layout::new::<IntrusiveNode<T>>();
    let raw = unsafe { alloc(layout) as *mut IntrusiveNode<T> };
    let nn = NonNull::new(raw).expect("alloc failure");
    // SAFETY：我们刚刚完成了分配，因此内存未初始化但合法。
    unsafe {
        ptr::write(nn.as_ptr(), IntrusiveNode { value, next: None });
    }
    nn
}

/// # Safety
/// 调用者必须确保该节点已不再被链接，且不存在其他别名引用。
pub unsafe fn dealloc_node<T>(node: NonNull<IntrusiveNode<T>>) {
    let layout = Layout::new::<IntrusiveNode<T>>();
    // SAFETY：调用者保证该节点已脱离链表且未被别名。
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
        // SAFETY：我们拥有返回的节点，并在释放前将其移除。
        let n2 = unsafe { alloc_node(20) };
        let n1 = unsafe { alloc_node(10) };
        unsafe {
            list.push(n1);
            list.push(n2);
        }
        assert_eq!(list.peek(), Some(&20));
        assert_eq!(list.len(), 2);
        // SAFETY：节点由本测试作用域独占持有。
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
        // SAFETY：写入操作已被追踪。
        let s = unsafe { buf.read() };
        assert_eq!(s, "hello");
    }
}
