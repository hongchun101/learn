//! 闭包与三种闭包 trait：`Fn`、`FnMut`、`FnOnce`。
//!
//! 练习内容：
//! - 使用闭包参数的高阶函数。
//! - `FnMut` 要求对捕获状态使用 `&mut`。
//! - `FnOnce` 只能被调用一次。
//! - 通过捕获可变变量实现“状态机”。

use std::sync::Mutex;

/// 一个接受 `impl Fn` 的函数，针对闭包类型泛型化。
/// 使用闭包逐块变换 `s`。闭包被依次以"前半段""后半段"为入参调用，
/// 返回值会累积到结果 `String` 中。
///
/// 之所以要求 `FnMut` 是因为闭包会消费每次调用的输入；示例体现
/// 了高阶函数在闭包上的泛型化方式。
pub fn apply<F>(s: &mut String, mut f: F)
where
    F: FnMut(&str) -> String,
{
    // 备份原内容后清空 `s`，让闭包可以原地往里追加。
    let drained: String = std::mem::take(s);
    // 演示方式：把字符串按 ASCII 空白切成多个片段，
    // 用闭包逐个包装后再写回。
    for piece in drained.split_whitespace() {
        s.push_str(&f(piece));
    }
}

/// 一个接受 `FnMut` 的函数（同时也满足 `Fn`）。
pub fn double_each<F>(items: Vec<i32>, mut f: F) -> Vec<i32>
where
    F: FnMut(i32) -> i32,
{
    items.into_iter().map(|v| f(v)).collect()
}

/// 一个接受 `FnOnce` 的函数，最多只能被调用一次。
pub fn with_owned<F, T>(f: F) -> T
where
    F: FnOnce() -> T,
{
    f()
}

/// 一个使用 `FnMut` 实现的小型状态机：每次调用 `step` 都会推进一个状态。
pub struct StateMachine<F>
where
    F: FnMut(i32) -> i32,
{
    state: i32,
    func: F,
}

impl<F> StateMachine<F>
where
    F: FnMut(i32) -> i32,
{
    pub fn new(initial: i32, func: F) -> Self {
        Self {
            state: initial,
            func,
        }
    }

    pub fn step(&mut self) -> Option<i32> {
        if self.state > 10 {
            return None;
        }
        let prev = self.state;
        self.state = (self.func)(self.state);
        Some(prev)
    }

    pub fn current(&self) -> i32 {
        self.state
    }
}

/// 从函数返回闭包需要使用不透明的 `impl Fn` 返回类型。
pub fn make_adder(by: i32) -> impl Fn(i32) -> i32 {
    move |x| x + by
}

/// 一个会修改其捕获状态的闭包，用于统计它被调用的次数。
pub fn counting_closre() -> impl FnMut() -> usize {
    let mut count = 0usize;
    move || {
        let prev = count;
        count += 1;
        prev
    }
}

/// 一个 `FnOnce` 闭包，会消费它所捕获的值。
pub fn once_only_callback<F>(cb: F)
where
    F: FnOnce(String),
{
    cb(String::from("fired"));
}

/// 通过捕获 `Mutex` 演示闭包可以安全地与共享状态交互。
pub fn run_with_mutex<F>(slot: &Mutex<i32>, mut f: F) -> i32
where
    F: FnMut(&mut i32),
{
    let mut guard = slot.lock().expect("poisoned");
    f(&mut *guard);
    *guard
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_uses_fn_mut() {
        let mut s = String::from("hello world rust");
        apply(&mut s, |piece| format!("[{piece}]"));
        // `apply` 按空白切分并用闭包包装每个片段，结果按顺序拼接。
        assert_eq!(s, "[hello][world][rust]");
    }

    #[test]
    fn double_each_works() {
        let doubled = double_each(vec![1, 2, 3], |v| v * 2);
        assert_eq!(doubled, vec![2, 4, 6]);
    }

    #[test]
    fn with_owned_returns_value() {
        let captured = String::from("captured");
        let owned = with_owned(move || captured.clone());
        assert_eq!(owned, "captured");
    }

    #[test]
    fn state_machine_steps() {
        let mut sm = StateMachine::new(0, |x| x + 1);
        let seq: Vec<i32> = std::iter::from_fn(|| sm.step()).collect();
        assert_eq!(seq, vec![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }

    #[test]
    fn make_adder_works() {
        let add5 = make_adder(5);
        assert_eq!(add5(3), 8);
    }

    #[test]
    fn counting_closure_remembers_count() {
        let mut count = counting_closre();
        assert_eq!(count(), 0);
        assert_eq!(count(), 1);
        assert_eq!(count(), 2);
    }

    #[test]
    fn run_with_mutex_mutates() {
        let m = Mutex::new(5);
        let v = run_with_mutex(&m, |x| *x *= 2);
        assert_eq!(v, 10);
    }

    #[test]
    fn once_only_callback_runs() {
        let captured = Mutex::new(String::new());
        once_only_callback(|s| {
            *captured.lock().unwrap() = s;
        });
        assert_eq!(*captured.lock().unwrap(), "fired");
    }
}
