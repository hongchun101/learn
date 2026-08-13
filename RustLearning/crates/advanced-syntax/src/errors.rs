//! 错误处理：`thiserror` 库错误与 `anyhow` 应用层错误包装。
//! 使用 `From` impl 进行分层错误处理。

use thiserror::Error;

/// 领域错误。这些用于描述库层“哪里出了错”。
#[derive(Debug, Error)]
pub enum DomainError {
    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("permission denied")]
    PermissionDenied,

    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl From<&str> for DomainError {
    fn from(s: &str) -> Self {
        Self::InvalidInput(s.to_string())
    }
}

impl From<String> for DomainError {
    fn from(s: String) -> Self {
        Self::InvalidInput(s)
    }
}

/// 应用层错误包装：在保留类型化领域错误的同时，添加上下文（当前正在进行的操作）。
#[derive(Debug, Error)]
pub enum AppError {
    #[error("during {op}: {source}")]
    During {
        op: &'static str,
        #[source]
        source: DomainError,
    },

    #[error(transparent)]
    Domain(#[from] DomainError),
}

impl AppError {
    pub fn during(op: &'static str, e: DomainError) -> Self {
        Self::During { op, source: e }
    }
}

pub fn parse_even(n: &str) -> Result<u32, AppError> {
    if n.is_empty() {
        return Err(AppError::during(
            "parse_even",
            DomainError::InvalidInput("empty".into()),
        ));
    }
    let value: u32 = n.parse().map_err(|_: std::num::ParseIntError| {
        AppError::during("parse_even", DomainError::InvalidInput(n.to_string()))
    })?;
    if value % 2 != 0 {
        return Err(AppError::During {
            op: "parse_even",
            source: DomainError::InvalidInput("odd".into()),
        });
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_even_accepts_even() {
        assert_eq!(parse_even("4").unwrap(), 4);
    }

    #[test]
    fn parse_even_rejects_odd() {
        let err = parse_even("5").unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("parse_even"));
    }

    #[test]
    fn into_conversion_works() {
        let app: AppError = DomainError::PermissionDenied.into();
        assert!(matches!(
            app,
            AppError::Domain(DomainError::PermissionDenied)
        ));
    }

    #[test]
    fn from_str_conversion_works() {
        let d: DomainError = "bad".into();
        assert!(matches!(d, DomainError::InvalidInput(_)));
    }
}
