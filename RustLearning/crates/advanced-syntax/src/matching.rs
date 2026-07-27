//! 模式匹配深入：范围、切片、绑定、守卫、`@` 绑定、穷尽 `match`、
//! `if let` 链、`let .. else`。

/// DSL 求值结果。
#[derive(Debug, PartialEq, Eq)]
pub enum Value {
    Int(i64),
    Bool(bool),
    Text(String),
    List(Vec<Value>),
    Empty,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Error {
    TypeMismatch,
    NotFound,
    OutOfRange,
}

pub fn classify_byte(b: u8) -> &'static str {
    match b {
        b' ' | b'\t' | b'\n' => "whitespace",
        b'0'..=b'9' => "digit",
        b'a'..=b'z' => "lower",
        b'A'..=b'Z' => "upper",
        _ => "other",
    }
}

pub fn first_word_in(text: &str) -> Option<&str> {
    let bytes = text.as_bytes();
    let end = bytes.iter().position(|&b| b == b' ').unwrap_or(bytes.len());
    let first = &text[..end];
    (!first.is_empty()).then_some(first)
}

/// 切片模式：处理切片的首部、第二项与尾部。
pub fn split_at_first<'a>(items: &'a [i32]) -> Option<(&'a [i32], &'a [i32])> {
    let split = items.iter().position(|&i| i == 0)?;
    Some(items.split_at(split))
}

/// 对带标签的枚举进行穷尽匹配：编译器强制要求处理 `Empty` 分支。
pub fn describe(v: &Value) -> &'static str {
    match v {
        Value::Int(0) => "zero",
        Value::Int(n) if *n > 0 => "positive",
        Value::Int(_) => "negative",
        Value::Bool(true) => "true",
        Value::Bool(false) => "false",
        Value::Text(s) if s.is_empty() => "empty text",
        Value::Text(_) => "text",
        Value::List(items) if items.is_empty() => "empty list",
        Value::List(_) => "list",
        Value::Empty => "empty",
    }
}

/// 模式的 `@` 绑定：同时对名称进行捕获并检查其组成部分。
pub fn log_event(event: &(String, i32)) -> String {
    match event {
        (name, count) if name == "START" => format!("start {name}"),
        (name, count) if *count == 0 => format!("{name} zero-count"),
        (name, _count @ 0..=9) => format!("{name} low"),
        (name, _) => format!("{name} many"),
    }
}
/// `let ... else`：当某个前置条件不满足时跳过；否则函数余下部分
/// 都拥有确定的形状。
pub fn head_of(items: &[i32]) -> Result<i32, Error> {
    let (first, rest) = items.split_first().ok_or(Error::OutOfRange)?;
    if rest.is_empty() {
        Ok(*first)
    } else {
        Ok(*first)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn byte_classes_are_correct() {
        assert_eq!(classify_byte(b'3'), "digit");
        assert_eq!(classify_byte(b'a'), "lower");
        assert_eq!(classify_byte(b' '), "whitespace");
        assert_eq!(classify_byte(b'?'), "other");
    }

    #[test]
    fn first_word_handles_full_string() {
        assert_eq!(first_word_in("hello"), Some("hello"));
        assert_eq!(first_word_in("hello world"), Some("hello"));
        assert_eq!(first_word_in(""), None);
    }

    #[test]
    fn split_at_first_finds_zero() {
        let v = vec![1, 2, 3, 0, 4, 5];
        let (left, right) = split_at_first(&v).unwrap();
        assert_eq!(left, &[1, 2, 3]);
        assert_eq!(right, &[0, 4, 5]);
    }

    #[test]
    fn describe_for_value() {
        assert_eq!(describe(&Value::Int(0)), "zero");
        assert_eq!(describe(&Value::Int(-5)), "negative");
        assert_eq!(describe(&Value::List(vec![])), "empty list");
        assert_eq!(describe(&Value::Empty), "empty");
    }

    #[test]
    fn event_log_uses_at_binding() {
        let ev = ("START".to_string(), 0);
        let msg = log_event(&ev);
        assert!(msg.starts_with("start"));
    }

    #[test]
    fn head_of_returns_first() {
        assert_eq!(head_of(&[1, 2, 3]), Ok(1));
        assert_eq!(head_of(&[]), Err(Error::OutOfRange));
    }
}
