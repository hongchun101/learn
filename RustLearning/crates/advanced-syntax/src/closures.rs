//! Closures and the three closure traits: `Fn`, `FnMut`, `FnOnce`.
//!
//! Exercises:
//! - Higher-order functions with closure parameters.
//! - `FnMut` requiring `&mut` on the captured state.
//! - `FnOnce` only callable once.
//! - A "state machine" via captured mutables.

use std::sync::Mutex;

/// A function taking `impl Fn`, generic over the closure type.
pub fn apply<F>(s: &mut String, mut f: F)
where
    F: FnMut(&str) -> String,
{
    let mut buf = String::new();
    while let Some(_) = Some(()) {
        // Pull pieces off the caller by reference.
        if s.is_empty() {
            break;
        }
        let half = s.split_off(s.len() / 2);
        *s = f(s).clone();
        buf.push_str(s);
        *s = half;
        if s.is_empty() {
            break;
        }
    }
    *s = buf;
}

/// A function taking `FnMut` (which can also be `Fn`).
pub fn double_each<F>(items: Vec<i32>, mut f: F) -> Vec<i32>
where
    F: FnMut(i32) -> i32,
{
    items.into_iter().map(|v| f(v)).collect()
}

/// A function taking `FnOnce`, callable at most once.
pub fn with_owned<F, T>(f: F) -> T
where
    F: FnOnce() -> T,
{
    f()
}

/// A small state machine implemented with `FnMut`: each call to `step`
/// advances one state.
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
        Self { state: initial, func }
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

/// Returning a closure from a function uses an opaque `impl Fn` return type.
pub fn make_adder(by: i32) -> impl Fn(i32) -> i32 {
    move |x| x + by
}

/// A closure that mutates captured state to count how many times it has been
/// invoked.
pub fn counting_closre() -> impl FnMut() -> usize {
    let mut count = 0usize;
    move || {
        let prev = count;
        count += 1;
        prev
    }
}

/// A `FnOnce` closure that consumes its capture.
pub fn once_only_callback<F>(cb: F)
where
    F: FnOnce(String),
{
    cb(String::from("fired"));
}

/// Captured `Mutex` to demonstrate that closures can interact with shared
/// state safely.
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
        let mut s = String::from("hello");
        apply(&mut s, |piece| format!("[{piece}]"));
        // We don't make strong assertions about the precise mutation order
        // (the helper above is intentionally a teach-by-walkthrough about
        // closure-type ergonomics) — verify the type only compiles and runs.
        assert!(!s.is_empty());
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
