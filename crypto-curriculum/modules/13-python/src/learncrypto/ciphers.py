"""使用 pyca 的 cryptography.hazmat 实现 AES-256-GCM 的加解密往返。

运行方式::

    python -c "from learncrypto.ciphers import *; ..."
"""

from __future__ import annotations

import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def aes_gcm_encrypt(key: bytes, pt: bytes, aad: bytes | None = None) -> dict[str, bytes]:
    """使用 AES-256-GCM 加密 `pt`。返回 {ciphertext, nonce, tag}。

    `cryptography` 的 AESGCM.Seal 返回的是 ct||tag 拼接后的结果；我们将其拆分。
    """
    if len(key) != 32:
        raise ValueError("key must be 32 bytes")
    nonce = os.urandom(12)
    aes = AESGCM(key)
    sealed = aes.encrypt(nonce, pt, aad)
    ct, tag = sealed[:-16], sealed[-16:]
    return {"ciphertext": ct, "nonce": nonce, "tag": tag}


def aes_gcm_decrypt(key: bytes, env: dict[str, bytes], aad: bytes | None = None) -> bytes:
    if len(key) != 32:
        raise ValueError("key must be 32 bytes")
    aes = AESGCM(key)
    return aes.decrypt(env["nonce"], env["ciphertext"] + env["tag"], aad)
