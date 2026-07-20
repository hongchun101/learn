"""SHA-256, HMAC-SHA-256, HKDF-SHA-256 in pure stdlib."""

from __future__ import annotations

import hashlib
import hmac


def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def hmac_sha256(key: bytes, message: bytes) -> bytes:
    return hmac.new(key, message, hashlib.sha256).digest()


def hmac_sha256_verify(key: bytes, message: bytes, tag: bytes) -> bool:
    expected = hmac_sha256(key, message)
    return hmac.compare_digest(expected, tag)


def hkdf_sha256(master: bytes, out_len: int, salt: bytes = b"", info: bytes = b"") -> bytes:
    """RFC 5869 reference HKDF-SHA-256.

    `salt=None` is replaced with a string of 32 zero bytes; `info` is
    domain-separation data.
    """
    if out_len <= 0:
        raise ValueError("outLen must be positive")
    if out_len > 255 * 32:
        raise ValueError("outLen too large")

    if not salt:
        salt = bytes(32)

    prk = hmac.new(salt, master, hashlib.sha256).digest()
    out, prev, counter = bytearray(), b"", 1
    while len(out) < out_len:
        cur = hmac.new(prk, prev + info + bytes([counter]), hashlib.sha256).digest()
        out.extend(cur)
        prev = cur
        counter += 1
        if counter > 255:
            raise RuntimeError("HKDF overflow")
    return bytes(out[:out_len])
