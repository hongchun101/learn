//! Type-state builder, phantom types, and zero-sized types.
//!
//! This module shows how to use the type system to make invalid states
//! unrepresentable. Three patterns:
//!
//! 1. **Type-state builder**: each method on the builder is only available when
//!    the previous method has been called, encoded with marker types.
//! 2. **Phantom types**: a generic parameter that carries information for the
//!    type system but is zero-sized at runtime.
//! 3. **Zero-sized types**: unit structs used as compile-time witnesses.

use std::marker::PhantomData;

// ---------------------------------------------------------------------------
// 1. Type-state builder
// ---------------------------------------------------------------------------

/// Public, type-state-marked handle. Only `Builder<Empty>` is constructible.
pub struct Builder<State> {
    items: Vec<String>,
    _state: PhantomData<State>,
}

#[derive(Debug)]
pub struct Empty;
#[derive(Debug)]
pub struct WithName;
#[derive(Debug)]
pub struct WithAge;
#[derive(Debug)]
pub struct Ready;

impl Builder<Empty> {
    pub fn new() -> Self {
        Builder {
            items: Vec::new(),
            _state: PhantomData,
        }
    }

    pub fn name(self, name: &str) -> Builder<WithName> {
        Builder {
            items: add(self.items, format!("name={name}")),
            _state: PhantomData,
        }
    }
}

impl Builder<WithName> {
    pub fn age(self, age: u32) -> Builder<WithAge> {
        Builder {
            items: add(self.items, format!("age={age}")),
            _state: PhantomData,
        }
    }
}

impl Builder<WithAge> {
    pub fn build(self) -> Person {
        Person(self.items)
    }
}

impl Default for Builder<Empty> {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct Person(Vec<String>);

impl Person {
    pub fn fields(&self) -> &[String] {
        &self.0
    }
}

fn add(mut v: Vec<String>, item: String) -> Vec<String> {
    v.push(item);
    v
}

// ---------------------------------------------------------------------------
// 2. Phantom types
// ---------------------------------------------------------------------------

/// A wrapper that exists purely to carry a phantom type parameter.
pub struct Typed<Tag, T> {
    inner: T,
    _tag: PhantomData<Tag>,
}

impl<Tag, T> Typed<Tag, T> {
    pub fn value(&self) -> &T {
        &self.inner
    }
}

pub struct Kilometers;
pub struct Miles;

impl<T: FromKilo> Typed<Kilometers, T> {
    pub fn to_miles(self) -> Typed<Miles, T> {
        Typed {
            inner: self.inner.to_miles(),
            _tag: PhantomData,
        }
    }
}

pub trait FromKilo {
    fn to_miles(self) -> Self;
}

impl FromKilo for f64 {
    fn to_miles(self) -> Self {
        self * 0.621371
    }
}

pub fn kilometers<T>(value: T) -> Typed<Kilometers, T> {
    Typed {
        inner: value,
        _tag: PhantomData,
    }
}

// ---------------------------------------------------------------------------
// 3. Zero-sized types
// ---------------------------------------------------------------------------

/// A compile-time witness that does not occupy space at runtime.
#[derive(Debug)]
pub struct Authenticated;
#[derive(Debug)]
pub struct Unauthenticated;

#[derive(Debug)]
pub struct Session<Token> {
    user_id: u64,
    _token: Token,
}

impl Session<Unauthenticated> {
    pub fn login(self) -> Session<Authenticated> {
        Session {
            user_id: self.user_id,
            _token: Authenticated,
        }
    }
}

impl Session<Authenticated> {
    pub fn user_id(&self) -> u64 {
        self.user_id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builder_produces_field_list() {
        let person = Builder::new().name("Ada").age(36).build();
        assert_eq!(person.fields(), &["name=Ada", "age=36"]);
    }

    #[test]
    fn phantom_typed_value_converts() {
        let k = kilometers::<f64>(10.0);
        let m = Typed::<Kilometers, f64>::to_miles(k);
        assert!((m.value() - 6.21371).abs() < 1e-5);
    }

    #[test]
    fn session_must_log_in_before_use() {
        let sess = Session::<Unauthenticated> { user_id: 42, _token: Unauthenticated };
        let auth = Session::login(sess);
        assert_eq!(auth.user_id(), 42);
    }
}
