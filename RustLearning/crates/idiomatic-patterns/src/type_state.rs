//! 类型状态模式：在类型系统层编码状态机。
//!
//! 经典场景：网络连接的"建立 / 已建立 / 关闭"、事务的"打开 / 提交 / 回滚"、
//! 构建器的"未配置 / 已配置 / 已就绪"。每一种状态由一个零大小类型（ZST）表示，
//! 状态转移通过 `self` 的类型变化在编译期强制。
//!
//! 与运行时检查相比，类型状态的取舍：
//!
//! - 优点：非法状态无法表达、无运行时分支、文档即类型。
//! - 代价：类型参数变多、API 表面积变大；某些简单流程用 `enum` 更划算。

use std::fmt;
use std::marker::PhantomData;

// ---------------------------------------------------------------------------
// 1. TCP 连接状态机
// ---------------------------------------------------------------------------

/// 连接建立前的"句柄"。只能被用来 `connect`。
pub struct Disconnected;
/// 已连接。可被用来 `send` 等方法。
pub struct Connected {
    stream: std::net::TcpStream,
}
/// 关闭后：所有方法都不可用，只能 `Drop` 释放底层 socket。
pub struct Closed;

/// 一个编译期保证的状态机：每个状态的可用方法都不同。
pub struct Connection<State> {
    state: State,
    _marker: PhantomData<State>,
}

impl Connection<Disconnected> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            state: Disconnected,
            _marker: PhantomData,
        }
    }

    /// 解析并连接。返回类型从 `Disconnected` 变成 `Connected`。
    ///
    /// # Errors
    /// 当地址解析或 TCP 握手失败时传播 [`std::io::Error`]。
    pub fn connect(self, addr: &str) -> Result<Connection<Connected>, std::io::Error> {
        let stream = std::net::TcpStream::connect(addr)?;
        Ok(Connection {
            state: Connected { stream },
            _marker: PhantomData,
        })
    }
}

impl Default for Connection<Disconnected> {
    fn default() -> Self {
        Self::new()
    }
}

impl Connection<Connected> {
    /// 发送字节切片。
    ///
    /// # Errors
    /// 写入失败时返回 [`std::io::Error`]。
    pub fn send(&mut self, data: &[u8]) -> Result<usize, std::io::Error> {
        use std::io::Write;
        self.state.stream.write(data)
    }

    /// 主动关闭。
    pub fn shutdown(self) -> Connection<Closed> {
        // 真实代码中应当调用 `shutdown(Shut::Both)`；此处简化。
        drop(self.state.stream);
        Connection {
            state: Closed,
            _marker: PhantomData,
        }
    }
}

impl Connection<Closed> {
    /// 显式判定：连接已经关闭。
    #[must_use]
    pub fn is_closed(&self) -> bool {
        true
    }
}

// ---------------------------------------------------------------------------
// 2. 事务构建器
// ---------------------------------------------------------------------------

/// 事务状态标签：仅编译期使用，零运行时成本。
pub struct Open;
pub struct Committed;
pub struct RolledBack;

/// 一个简单的"事务"：`commit` 与 `rollback` 互斥，由类型系统保证只能调用其一。
pub struct Transaction<State> {
    ops: Vec<String>,
    _state: PhantomData<State>,
}

impl Transaction<Open> {
    #[must_use]
    pub fn begin() -> Self {
        Self {
            ops: Vec::new(),
            _state: PhantomData,
        }
    }

    pub fn push_op(&mut self, op: impl Into<String>) -> &mut Self {
        self.ops.push(op.into());
        self
    }

    /// 提交。返回操作列表与状态转移。
    pub fn commit(self) -> Transaction<Committed> {
        Transaction {
            ops: self.ops,
            _state: PhantomData,
        }
    }

    /// 回滚。状态变成 `RolledBack`。
    pub fn rollback(self) -> Transaction<RolledBack> {
        Transaction {
            ops: self.ops,
            _state: PhantomData,
        }
    }
}

impl Transaction<Committed> {
    #[must_use]
    pub fn ops(&self) -> &[String] {
        &self.ops
    }
}

impl fmt::Debug for Transaction<Committed> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Transaction::Committed")
            .field("ops", &self.ops)
            .finish()
    }
}

impl fmt::Debug for Transaction<RolledBack> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Transaction::RolledBack")
            .field("ops", &self.ops)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connection_state_machine_compiles() {
        // 类型层面：Connection<Disconnected>::send 不可调用 —— 编译期强制。
        let conn = Connection::<Disconnected>::new();
        // 试图连接到一个不存在的地址；我们只验证状态转移的类型检查通过。
        let _res: Result<Connection<Connected>, _> = conn.connect("127.0.0.1:1");
    }

    #[test]
    fn transaction_commit_records_ops() {
        let mut tx = Transaction::begin();
        tx.push_op("debit 10").push_op("credit 5");
        let committed = tx.commit();
        assert_eq!(committed.ops(), &["debit 10", "credit 5"]);
    }

    #[test]
    fn transaction_rollback_marks_state() {
        let mut tx = Transaction::begin();
        tx.push_op("noop");
        let rb = tx.rollback();
        // 用 Debug 表达状态。
        assert_eq!(
            format!("{rb:?}"),
            "Transaction::RolledBack { ops: [\"noop\"] }"
        );
    }

    #[test]
    fn closed_connection_reports_closed() {
        // 不会真正连接；只验证 Closed 状态上的方法可用。
        let conn: Connection<Closed> = Connection {
            state: Closed,
            _marker: PhantomData,
        };
        assert!(conn.is_closed());
    }
}
