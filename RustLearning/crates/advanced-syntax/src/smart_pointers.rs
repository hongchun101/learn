//! 智能指针与内部可变性。

use std::borrow::Cow;
use std::cell::RefCell;
use std::rc::Rc;

pub fn boxed_tree<T>(root: T) -> Box<T> {
    Box::new(root)
}

/// 引用计数的树。`Rc<T>` 是单线程的引用计数。
#[derive(Debug)]
pub enum RcTree<T> {
    Leaf(T),
    Branch(Rc<RcTree<T>>, Rc<RcTree<T>>),
}

impl<T> RcTree<T> {
    pub fn leaf(v: T) -> Self {
        Self::Leaf(v)
    }

    pub fn branch(left: Rc<Self>, right: Rc<Self>) -> Self {
        Self::Branch(left, right)
    }
}

/// 写时复制：当需要变换时返回拥有的数据；否则复用借用引用。
pub fn normalize_whitespace(input: &str) -> Cow<'_, str> {
    if input.contains("  ") {
        Cow::Owned(input.split_whitespace().collect::<Vec<_>>().join(" "))
    } else {
        Cow::Borrowed(input)
    }
}

/// `Arc<AtomicUsize>` 是典型的无锁共享计数器。
pub mod multi_thread {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[derive(Debug, Default)]
    pub struct Counter(Arc<AtomicUsize>);

    impl Counter {
        pub fn new() -> Self {
            Self(Arc::new(AtomicUsize::new(0)))
        }

        pub fn inc(&self) -> usize {
            self.0.fetch_add(1, Ordering::SeqCst)
        }

        pub fn snapshot(&self) -> usize {
            self.0.load(Ordering::SeqCst)
        }

        pub fn shared(&self) -> Arc<AtomicUsize> {
            Arc::clone(&self.0)
        }
    }
}

/// `RefCell<T>` 加上回调列表：单线程下的可观察对象。
pub struct CellObservable<T> {
    value: Rc<RefCell<T>>,
    listeners: RefCell<Vec<Rc<dyn Fn(&T)>>>,
}

impl<T: 'static> CellObservable<T> {
    pub fn new(value: T) -> Self {
        Self {
            value: Rc::new(RefCell::new(value)),
            listeners: RefCell::new(Vec::new()),
        }
    }

    pub fn observe(&self) -> Rc<RefCell<T>> {
        Rc::clone(&self.value)
    }

    pub fn subscribe(&self, cb: Rc<dyn Fn(&T)>) {
        self.listeners.borrow_mut().push(cb);
    }

    pub fn set(&self, value: T) {
        *self.value.borrow_mut() = value;
        for cb in self.listeners.borrow().iter() {
            cb(&self.value.borrow());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cow_borrowed_path() {
        let s = Cow::Borrowed("abc");
        assert_eq!(normalize_whitespace(s.as_ref()), "abc");
    }

    #[test]
    fn cow_owned_path() {
        let s = normalize_whitespace("a  b   c");
        assert_eq!(s, "a b c");
        assert!(matches!(s, Cow::Owned(_)));
    }

    #[test]
    fn refcell_observable_notifies() {
        let cell = CellObservable::<i32>::new(0);
        let collected: Rc<RefCell<Vec<i32>>> = Rc::new(RefCell::new(Vec::new()));
        let collected_clone = Rc::clone(&collected);
        cell.subscribe(Rc::new(move |v| collected_clone.borrow_mut().push(*v)));
        cell.set(1);
        cell.set(2);
        assert_eq!(*collected.borrow(), vec![1, 2]);
    }

    #[test]
    fn counter_atomic_increments() {
        let counter = multi_thread::Counter::new();
        let c2 = counter.shared();
        counter.inc();
        c2.fetch_add(2, std::sync::atomic::Ordering::SeqCst);
        assert_eq!(counter.snapshot(), 3);
    }

    #[test]
    fn rc_tree_balances() {
        let leaf = RcTree::leaf(1);
        let branch = RcTree::branch(Rc::new(leaf), Rc::new(RcTree::leaf(2)));
        assert!(matches!(branch, RcTree::Branch(_, _)));
    }

    #[test]
    fn box_allocates() {
        let boxed = boxed_tree(42);
        assert_eq!(*boxed, 42);
    }
}
