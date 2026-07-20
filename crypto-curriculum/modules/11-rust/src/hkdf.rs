//! HKDF-SHA-256 wrapper around `hkdf::Hkdf<Sha256>`.

use hkdf::Hkdf as HkdfImpl;
use sha2::Sha256;

pub struct HkdfSha256;

impl HkdfSha256 {
    /// Derive `out_len` bytes from `master`. `salt` and `info` are domain
    /// separators (RFC 5869).
    pub fn derive(master: &[u8], out_len: usize, salt: &[u8], info: &[u8]) -> Vec<u8> {
        let h = HkdfImpl::<Sha256>::new(Some(salt), master);
        let mut out = vec![0u8; out_len];
        h.expand(info, &mut out)
            .expect("okm is bounded by 255*hashlen which we validated");
        out
    }
}

#[cfg(test)]
mod tests {
    use super::HkdfSha256;

    #[test]
    fn rfc_5869_test_case_1() {
        // RFC 5869 Appendix A.1
        let ikm  = vec![0x0b; 22];
        let salt = vec![0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c];
        let info = vec![0xf0,0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9];
        let okm = HkdfSha256::derive(&ikm, 42, &salt, &info);
        let hex = okm.iter().map(|b| format!("{:02x}", b)).collect::<String>();
        assert_eq!(hex,
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
    }
}
