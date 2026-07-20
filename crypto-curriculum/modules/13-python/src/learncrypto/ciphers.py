"""AES-256-GCM round-trip using pyca's cryptography.hazmat.

Run with::

    python -c "from learncrypto.ciphers import *; ..."
"""

from __future__ import annotations

import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def aes_gcm_encrypt(key: bytes, pt: bytes, aad: bytes | None = None) -> dict[str, bytes]:
    """Encrypt `pt` with AES-256-GCM. Returns {ciphertext, nonce, tag}.

    The `cryptography` AESGCM.Seal returns ct||tag concatenated; we split.
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
