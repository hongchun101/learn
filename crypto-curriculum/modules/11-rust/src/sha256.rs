//! SHA-256 wrapper around `sha2::Sha256`.

use sha2::{Digest, Sha256 as Sha256Impl};

pub struct Sha256;

impl Sha256 {
    pub const OUTPUT_LEN: usize = 32;

    pub fn hash(data: &[u8]) -> [u8; 32] {
        let mut h = Sha256Impl::new();
        h.update(data);
        h.finalize().into()
    }
}

#[cfg(test)]
mod tests {
    use super::Sha256;

    #[test]
    fn canonical_empty() {
        assert_eq!(
            Sha256::hash(b"").iter().map(|b| format!("{:02x}", b)).collect::<String>(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    #[test]
    fn canonical_abc() {
        assert_eq!(
            Sha256::hash(b"abc").iter().map(|b| format!("{:02x}", b)).collect::<String>(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
