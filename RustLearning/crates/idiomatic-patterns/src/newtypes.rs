//! newtype 模式与单位类型。
//!
//! newtype 在 Rust 中的核心作用是**让非法状态在类型层无法表达**：
//! 它给原始值（数字、字符串、字节）打上语义标签并暴露受限 API。
//!
//! 本模块展示三个最常见的形态：
//!
//! 1. **带校验的 newtype**：构造时执行不变式检查，非法输入直接返回错误。
//! 2. **单位区分**：用零成本标记区分同一种原始类型表示的不同物理量。
//! 3. **强类型 ID**：防止 `UserId(1)` 与 `OrderId(1)` 互换。

use std::fmt;
use std::num::ParseIntError;
use std::str::FromStr;

use thiserror::Error;

/// 端口号 newtype：值域 1..=65535，构造时校验。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Port(u16);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PortError {
    #[error("port must be in 1..=65535, got {0}")]
    OutOfRange(u16),
}

impl Port {
    /// 构造一个端口。要求非 0。
    pub fn new(value: u16) -> Result<Self, PortError> {
        if value == 0 {
            Err(PortError::OutOfRange(value))
        } else {
            Ok(Self(value))
        }
    }

    #[must_use]
    pub fn get(self) -> u16 {
        self.0
    }
}

impl fmt::Display for Port {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for Port {
    type Err = PortParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let n: u16 = s.parse().map_err(PortParseError::Int)?;
        Port::new(n).map_err(PortParseError::Range)
    }
}

#[derive(Debug, Error)]
pub enum PortParseError {
    #[error(transparent)]
    Int(ParseIntError),
    #[error(transparent)]
    Range(PortError),
}

// ---------------------------------------------------------------------------
// 单位区分
// ---------------------------------------------------------------------------

/// 用 `u64` 表示毫秒。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Millis(pub u64);

/// 用 `u64` 表示纳秒。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Nanos(pub u64);

impl Millis {
    #[must_use]
    pub fn to_nanos(self) -> Nanos {
        // 故意在 1 ms = 1_000_000 ns 处留出溢出空间；超过约 1.8e10 ms 时
        // 会溢出，调用方需自行处理——这正是单位换算库常见的设计取舍。
        Nanos(self.0.saturating_mul(1_000_000))
    }
}

/// 把两个毫秒相减得到 [`std::time::Duration`]。返回 `None` 表示负数。
#[must_use]
pub fn millis_diff(a: Millis, b: Millis) -> Option<Millis> {
    a.0.checked_sub(b.0).map(Millis)
}

// ---------------------------------------------------------------------------
// 强类型 ID
// ---------------------------------------------------------------------------

/// 用户 ID。`UserId(1)` 与 `OrderId(1)` 永远不会相等、永远不会混用。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UserId(pub u64);

/// 订单 ID。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct OrderId(pub u64);

/// 把 user id 与 order id 成对返回，方便下游使用。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UserOrder {
    pub user: UserId,
    pub order: OrderId,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_rejects_zero() {
        assert_eq!(Port::new(0), Err(PortError::OutOfRange(0)));
    }

    #[test]
    fn port_accepts_typical_values() {
        assert!(Port::new(80).is_ok());
        assert!(Port::new(65535).is_ok());
    }

    #[test]
    fn port_parses_from_string() {
        let p: Port = "8080".parse().unwrap();
        assert_eq!(p.get(), 8080);
    }

    #[test]
    fn port_rejects_invalid_text() {
        assert!("not-a-number".parse::<Port>().is_err());
        assert!("0".parse::<Port>().is_err());
    }

    #[test]
    fn millis_to_nanos_is_one_million() {
        let ms = Millis(3);
        assert_eq!(ms.to_nanos(), Nanos(3_000_000));
    }

    #[test]
    fn millis_diff_handles_underflow() {
        assert_eq!(millis_diff(Millis(5), Millis(8)), None);
        assert_eq!(millis_diff(Millis(8), Millis(5)), Some(Millis(3)));
    }

    #[test]
    fn user_and_order_ids_never_mix() {
        // 类型系统保证：`UserId(1) == OrderId(1)` 连比较都不可编译。
        let user = UserId(1);
        let order = OrderId(1);
        assert_eq!(user, UserId(1));
        assert_eq!(order, OrderId(1));
        let pair = UserOrder { user, order };
        assert_eq!(pair.user, user);
    }
}
