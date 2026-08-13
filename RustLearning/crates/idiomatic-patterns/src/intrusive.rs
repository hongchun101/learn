//! 侵入式容器：手动管理节点内存，零分配开销。
//!
//! "侵入式"指把链接字段（next 指针）放在元素类型内部，**元素自己**
//! 包含链接关系。优势：
//!
//! - 一次分配（`Box<Node<T>>`），无需额外的 `Node<T>` 包装。
//! - 零拷贝的 splice / split 操作。
//! - 适合异构容器（同一份内存可被多个容器引用）。
//!
//! 缺点：
//!
//! - 元素类型必须为侵入式容器"预留"链接字段（即 `Node<T>`）。
//! - 操作不当容易产生 use-after-free；这里用 `unsafe` 严守不变量。
//!
//! 本模块提供**安全**的 [`IntrusiveList<T>`]：节点 `Node<T>` 内含链接，
//! 链表负责所有不变量。drop 链在 `Drop` 实现里逐节点回收。

#![allow(unsafe_code)]

use std::fmt;
use std::ptr::NonNull;

/// 链表节点：把值与 `next` 指针放在同一份分配里。
#[derive(Debug)]
pub struct Node<T> {
    pub value: T,
    pub next: Option<NonNull<Node<T>>>,
}

impl<T> Node<T> {
    #[must_use]
    pub fn new(value: T) -> Self {
        Self { value, next: None }
    }
}

/// 单链表所有权：持有头节点的 `Box` 的方式相同，
/// 只是 `next` 字段是 `NonNull` 而不是 `Box`。
pub struct IntrusiveList<T> {
    head: Option<NonNull<Node<T>>>,
    len: usize,
}

impl<T> IntrusiveList<T> {
    #[must_use]
    pub fn new() -> Self {
        Self { head: None, len: 0 }
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.len
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// 把一个新节点推入链表头。`node` 的所有权移交给链表。
    pub fn push_front(&mut self, mut node: Box<Node<T>>) {
        let ptr = NonNull::from(&mut *node);
        // SAFETY：ptr 派生自 `node` 的借用，box 尚未释放，写入合法。
        unsafe {
            (*ptr.as_ptr()).next = self.head;
        }
        self.head = Some(ptr);
        std::mem::forget(node);
        self.len += 1;
    }

    /// 弹出链表头节点，把所有权还给调用方。
    pub fn pop_front(&mut self) -> Option<Box<Node<T>>> {
        let head = self.head?;
        // SAFETY：`head` 是由 `push_front` 通过 `Box::from_raw` 配对回收的指针。
        let node = unsafe { Box::from_raw(head.as_ptr()) };
        self.head = node.next;
        self.len -= 1;
        Some(node)
    }

    /// 偷看一眼头节点的值，不弹出。
    #[must_use]
    pub fn peek_front(&self) -> Option<&T> {
        // SAFETY：head 由 push_front 写入；只要链表存在，节点就有效。
        self.head.map(|p| unsafe { &(*p.as_ptr()).value })
    }

    /// 复制一份当前链表的所有值到一个 `Vec`。
    pub fn to_vec(&self) -> Vec<T>
    where
        T: Clone,
    {
        let mut out = Vec::with_capacity(self.len);
        let mut cur = self.head;
        while let Some(p) = cur {
            // SAFETY：节点在链表存在期间均有效。
            let node = unsafe { &*p.as_ptr() };
            out.push(node.value.clone());
            cur = node.next;
        }
        out
    }
}

impl<T> Default for IntrusiveList<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> Drop for IntrusiveList<T> {
    fn drop(&mut self) {
        // 顺序释放每一个节点。
        while self.pop_front().is_some() {
            // Box 自动释放。
        }
    }
}

impl<T: fmt::Debug + Clone> fmt::Debug for IntrusiveList<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list().entries(self.to_vec()).finish()
    }
}

// ---------------------------------------------------------------------------
// "擦除类型" 抽象：用 trait 把 next 字段定位与具体类型解耦。
// ---------------------------------------------------------------------------

/// 给定类型 `T` 与其内部链接字段，定义如何在 `T` 中定位 `next`。
///
/// # Safety
/// 实现必须保证对 `T` 中链接字段的访问不会与 `T` 的其他访问重叠；
/// `link_mut` 拿到的 `NonNull<()>` 在链表操作期间保持有效。
pub unsafe trait Linked {
    /// 取得 `item` 中 `next: Option<NonNull<Self>>` 字段的指针，擦除类型。
    fn next_ptr(item: NonNull<Self>) -> NonNull<Option<NonNull<Self>>>;
}

/// # Safety
/// `Node<T>` 内部 `next` 字段位置固定且不与 `value` 重叠。
unsafe impl<T> Linked for Node<T> {
    fn next_ptr(item: NonNull<Self>) -> NonNull<Option<NonNull<Self>>> {
        // SAFETY：调用方保证 `item` 有效；`next` 字段在 Node 内位置固定。
        unsafe { NonNull::new_unchecked(&raw mut (*item.as_ptr()).next) }
    }
}

/// 一份"擦除类型"的列表：元素通过 [`Linked`] trait 提供链接字段。
pub struct GenericList<T: Linked> {
    head: Option<NonNull<T>>,
    len: usize,
}

impl<T: Linked> GenericList<T> {
    #[must_use]
    pub fn new() -> Self {
        Self { head: None, len: 0 }
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.len
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// 把一个 boxed 元素接到列表头。元素本身的 `next` 字段决定
    /// 它对其他节点是否仍然有引用——本实现假设 push 时 `next = None`。
    ///
    /// # Safety
    /// 调用方必须确保 `node.next == None`，否则会泄漏节点。
    pub unsafe fn push_front_unchecked(&mut self, mut node: Box<T>) {
        let ptr = NonNull::from(&mut *node);
        // SAFETY：调用方承诺 next 字段初始为 None；我们把它替换为旧 head。
        let next_field = T::next_ptr(ptr).as_ptr();
        unsafe { *next_field = self.head };
        std::mem::forget(node);
        self.len += 1;
    }
}

impl<T: Linked> Default for GenericList<T> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_pop_lifo() {
        let mut list: IntrusiveList<u32> = IntrusiveList::new();
        list.push_front(Box::new(Node::new(10)));
        list.push_front(Box::new(Node::new(20)));
        list.push_front(Box::new(Node::new(30)));
        assert_eq!(list.len(), 3);
        assert_eq!(list.peek_front(), Some(&30));
        assert_eq!(list.pop_front().unwrap().value, 30);
        assert_eq!(list.pop_front().unwrap().value, 20);
        assert_eq!(list.pop_front().unwrap().value, 10);
        assert!(list.pop_front().is_none());
    }

    #[test]
    fn drop_releases_all_nodes() {
        // 若有泄漏，valgrind / ASan 会报警。
        let mut list: IntrusiveList<String> = IntrusiveList::new();
        for i in 0..10 {
            list.push_front(Box::new(Node::new(format!("v{i}"))));
        }
        assert_eq!(list.len(), 10);
        drop(list);
    }

    #[test]
    fn to_vec_preserves_order() {
        let mut list: IntrusiveList<u32> = IntrusiveList::new();
        list.push_front(Box::new(Node::new(1)));
        list.push_front(Box::new(Node::new(2)));
        list.push_front(Box::new(Node::new(3)));
        assert_eq!(list.to_vec(), vec![3, 2, 1]);
    }

    #[test]
    fn generic_list_pushes_node() {
        let mut list: GenericList<Node<u32>> = GenericList::new();
        // SAFETY：Node::new 默认 next = None。
        unsafe {
            list.push_front_unchecked(Box::new(Node::new(42)));
        }
        assert_eq!(list.len(), 1);
    }
}
