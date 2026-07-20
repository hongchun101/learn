"""Six contract tests for the Python primitives.

Requires ``cryptography`` (pyca) for AES-GCM and Ed25519; HMAC/HKDF/SHA-256 use
stdlib only.
"""

import os
import pytest

from learncrypto.ciphers import aes_gcm_encrypt, aes_gcm_decrypt
from learncrypto.hashes import sha256, hmac_sha256, hmac_sha256_verify, hkdf_sha256

SKIP_NETWORK = False


def test_aes_gcm_round_trip():
    key = os.urandom(32)
    pt = os.urandom(57)
    env = aes_gcm_encrypt(key, pt)
    pt2 = aes_gcm_decrypt(key, env)
    assert pt2 == pt


def test_aes_gcm_rejects_flipped_tag():
    key = os.urandom(32)
    pt = os.urandom(64)
    env = aes_gcm_encrypt(key, pt)
    env["tag"] = env["tag"][:15] + bytes([env["tag"][15] ^ 0x80])
    with pytest.raises(Exception):
        aes_gcm_decrypt(key, env)


def test_hmac_sha256_round_trip_and_forgery():
    k = os.urandom(32)
    m = os.urandom(64)
    tag = hmac_sha256(k, m)
    assert len(tag) == 32
    assert hmac_sha256_verify(k, m, tag)
    assert not hmac_sha256_verify(k, m, tag[:7] + bytes([tag[7] ^ 0x10]) + tag[8:])


def test_sha256_canonical():
    assert sha256(b"").hex() == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    assert sha256(b"abc").hex() == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_hkdf_rfc_5869_test_case_1():
    ikm  = b"\x0b" * 22
    salt = bytes(range(13))
    info = bytes([0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9])
    okm  = hkdf_sha256(ikm, 42, salt, info)
    assert okm.hex() == (
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
    )


def test_csprng_distinctness():
    seen = set()
    for _ in range(50_000):
        seen.add(os.urandom(16).hex())
    assert len(seen) == 50_000
