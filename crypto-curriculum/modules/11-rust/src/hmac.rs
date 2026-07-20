//! HMAC-SHA-256 wrapper around `hmac::Hmac<sha2::Sha256>`.

use hmac::{Hmac, Mac};
use sha2::Sha256;

pub struct HmacSha256;

impl HmacSha256 {
    pub const TAG_LEN: usize = 32;

    pub fn sign(key: &[u8], message: &[u8]) -> [u8; 32] {
        let mut mac = <Hmac<Sha256>>::new_from_slice(key)
            .expect("HMAC accepts keys of any length");
        mac.update(message);
        mac.finalize().into_bytes().into()
    }

    pub fn verify(key: &[u8], message: &[u8], tag: &[u8]) -> bool {
        let expected = Self::sign(key, message);
        // Constant-time compare via byte-wise XOR-fold.
        if expected.len() != tag.len() {
            return false;
        }
        let mut diff = 0u8;
        for i in 0..expected.len() {
            diff |= expected[i] ^ tag[i];
        }
        diff == 0
    }
}

#[cfg(test)]
mod tests {
    use super::HmacSha256;

    #[test]
    fn round_trip() {
        let k = [0xab; 32];
        let m = b"the message";
        let t = HmacSha256::sign(&k, m);
        assert!(HmacSha256::verify(&k, m, &t));
        assert!(!HmacSha256::verify(&k, m, &{
            let mut t = t;
            t[7] ^= 0x01;
            t
        }));
    }
}
