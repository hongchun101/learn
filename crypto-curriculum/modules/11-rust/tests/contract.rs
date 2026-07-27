//! Rust 中的跨章节契约测试。其他模块检验的同一组六条性质；
//! 形式相同，只是换成另一种语言。

use crypto_curriculum_rust::{HmacSha256, HkdfSha256, Sha256, random_bytes};

#[test]
fn hmac_sign_and_verify() {
    let k = random_bytes(32);
    let m = random_bytes(64);
    let t = HmacSha256::sign(&k, &m);
    assert_eq!(t.len(), 32);
    assert!(HmacSha256::verify(&k, &m, &t));
    let mut tf = t;
    tf[7] ^= 0x10;
    assert!(!HmacSha256::verify(&k, &m, &tf));
}

#[test]
fn sha256_canonical() {
    let hex_empty = Sha256::hash(b"")
        .iter().map(|b| format!("{:02x}", b)).collect::<String>();
    assert_eq!(hex_empty,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    let hex_abc = Sha256::hash(b"abc")
        .iter().map(|b| format!("{:02x}", b)).collect::<String>();
    assert_eq!(hex_abc,
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}

#[test]
fn hkdf_rfc_5869_test_case_1() {
    let ikm  = vec![0x0b; 22];
    let salt = vec![0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c];
    let info = vec![0xf0,0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9];
    let okm = HkdfSha256::derive(&ikm, 42, &salt, &info);
    let hex = okm.iter().map(|b| format!("{:02x}", b)).collect::<String>();
    assert_eq!(hex,
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
}

#[test]
fn hkdf_domain_separation() {
    let master = random_bytes(32);
    let a = HkdfSha256::derive(&master, 32, &[], b"enc");
    let b = HkdfSha256::derive(&master, 32, &[], b"mac");
    assert_ne!(a, b);
}

#[test]
fn csprng_uniqueness_50k() {
    use std::collections::HashSet;
    let mut seen = HashSet::new();
    for _ in 0..50_000 {
        let v = random_bytes(16);
        let hex = v.iter().map(|b| format!("{:02x}", b)).collect::<String>();
        seen.insert(hex);
    }
    assert_eq!(seen.len(), 50_000);
}
