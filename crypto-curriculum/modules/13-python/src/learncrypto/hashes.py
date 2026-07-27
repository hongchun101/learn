"""纯标准库实现的 SHA-256、HMAC-SHA-256、HKDF-SHA-256。"""

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
    """RFC 5869 参考实现 HKDF-SHA-256。

    `salt=None` 会被替换为 32 个零字节字符串；`info` 是域分隔数据。
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
