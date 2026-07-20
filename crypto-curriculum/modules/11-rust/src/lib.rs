//! Cross-module contract surface in Rust.
//!
//! Each primitive is a thin wrapper around a reputable crate. The functions
//! follow the same shape as the TypeScript reference:
//!
//!   fn encrypt(key: [u8; 32], pt: &[u8]) -> (ct, nonce, tag) — etc.
//!
//! But because Rust does not need 16-byte randomness, we use `csprng::random_bytes`
//! from the `getrandom` family of crates.

pub mod csprng;
pub mod hkdf;
pub mod hmac;
pub mod sha256;

#[cfg(feature = "aes")]
pub mod aesgcm;

pub use csprng::random_bytes;
pub use hkdf::HkdfSha256;
pub use hmac::HmacSha256;
pub use sha256::Sha256;
