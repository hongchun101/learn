//! Const generics: compile-time type parameterization by `const` values.

#![allow(unsafe_code)]
use std::mem::MaybeUninit;

/// A stack-allocated fixed-capacity stack. The capacity is part of the type.
pub struct ConstStack<T: Copy, const N: usize> {
    items: [MaybeUninit<T>; N],
    len: usize,
}

impl<T: Copy, const N: usize> ConstStack<T, N> {
    pub const fn new() -> Self {
        Self {
            items: [MaybeUninit::uninit(); N],
            len: 0,
        }
    }

    pub const fn capacity(&self) -> usize {
        N
    }

    pub const fn len(&self) -> usize {
        self.len
    }

    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn push(&mut self, item: T) -> Result<(), T> {
        if self.len == N {
            return Err(item);
        }
        self.items[self.len] = MaybeUninit::new(item);
        self.len += 1;
        Ok(())
    }

    pub fn pop(&mut self) -> Option<T> {
        if self.len == 0 {
            return None;
        }
        self.len -= 1;
        // SAFETY: `len` was > 0 before decrement, so the slot is initialized.
        let slot = std::mem::replace(&mut self.items[self.len], MaybeUninit::uninit());
        Some(unsafe { slot.assume_init() })
    }

    pub fn as_slice(&self) -> Vec<T> {
        let mut out = Vec::with_capacity(self.len);
        for i in 0..self.len {
            // SAFETY: every slot below `len` is initialized.
            let val = unsafe { self.items[i].assume_init_ref() };
            out.push(*val);
        }
        out
    }
}

impl<T: Copy, const N: usize> Default for ConstStack<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

/// A `const fn` that computes a value at compile time.
pub const fn next_power_of_two(n: u32) -> u32 {
    let mut p = 1u32;
    while p < n {
        p *= 2;
    }
    p
}

pub const BUFFER_SIZE: usize = next_power_of_two(8) as usize;

/// Use the const-generic parameter to size a fixed array without runtime alloc.
pub fn fill_with<T: Copy, const N: usize>(value: T) -> [T; N] {
    [value; N]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn const_stack_grows_and_shrinks() {
        let mut s = ConstStack::<i32, 4>::new();
        assert_eq!(s.capacity(), 4);
        assert!(s.is_empty());
        for x in [1, 2, 3] {
            s.push(x).unwrap();
        }
        assert_eq!(s.len(), 3);
        assert_eq!(s.pop(), Some(3));
        assert_eq!(s.pop(), Some(2));
    }

    #[test]
    fn power_of_two_const() {
        assert_eq!(next_power_of_two(1), 1);
        assert_eq!(next_power_of_two(5), 8);
        assert_eq!(next_power_of_two(16), 16);
    }

    #[test]
    fn buffer_size_is_a_const() {
        assert_eq!(BUFFER_SIZE, 8);
        let arr: [u8; BUFFER_SIZE] = fill_with::<u8, BUFFER_SIZE>(0);
        assert_eq!(arr.len(), 8);
    }

    #[test]
    fn fill_with_param_constant_size() {
        let arr = fill_with(7u32);
        assert_eq!(arr, [7u32; 8]);
    }

    #[test]
    fn push_overflow_returns_err() {
        let mut s = ConstStack::<u8, 2>::new();
        s.push(1).unwrap();
        s.push(2).unwrap();
        assert!(s.push(3).is_err());
    }
}
