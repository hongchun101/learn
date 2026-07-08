//! Error handling: `thiserror` library errors and `anyhow` application-layer
//! error wrappers. Layered errors using `From` impls.

use thiserror::Error;

/// Domain errors. These describe "what went wrong" in the library layer.
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

/// Application error wrapper that adds context (the operation in progress)
/// while keeping the typed domain error reachable.
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
        return Err(AppError::during("parse_even", DomainError::InvalidInput("empty".into())));
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
        assert!(matches!(app, AppError::Domain(DomainError::PermissionDenied)));
    }

    #[test]
    fn from_str_conversion_works() {
        let d: DomainError = "bad".into();
        assert!(matches!(d, DomainError::InvalidInput(_)));
    }
}
