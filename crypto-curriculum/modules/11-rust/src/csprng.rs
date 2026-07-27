//! `getrandom::getrandom` 的 CSPRNG 包装。

pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut out = vec![0u8; n];
    getrandom::getrandom(&mut out).expect("getrandom is on every supported platform");
    out
}

#[cfg(test)]
mod tests {
    use super::random_bytes;
    use std::collections::HashSet;

    #[test]
    fn determinism_of_lengths() {
        for n in [0, 1, 16, 32, 1024] {
            let out = random_bytes(n);
            assert_eq!(out.len(), n);
        }
    }

    #[test]
    fn collision_resistance_50k() {
        let mut seen = HashSet::new();
        for _ in 0..50_000 {
            let v = random_bytes(16);
            let hex = v.iter().map(|b| format!("{:02x}", b)).collect::<String>();
            seen.insert(hex);
        }
        assert_eq!(seen.len(), 50_000);
    }
}
