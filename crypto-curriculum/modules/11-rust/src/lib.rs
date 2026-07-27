//! Rust 中的跨模块契约接口面。
//!
//! 每个原语都是对成熟 crate 的薄包装。这些函数沿用 TypeScript 参考实现的形态：
//!
//!   fn encrypt(key: [u8; 32], pt: &[u8]) -> (ct, nonce, tag) —— 等等。
//!
//! 不过 Rust 不需要 16 字节的随机性；我们使用来自 `getrandom` crate 家族的
//! `csprng::random_bytes`。

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
