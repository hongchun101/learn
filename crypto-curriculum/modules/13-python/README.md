# Module 13 · Python Reference

> The most readable syntax for cryptography, with the deepest pit of bugs.

## Why Python gets its own module

Python is where most cryptography is *taught* and where most cryptography is
*used wrong*. The standard library (`hashlib`, `hmac`, `secrets`, `os.urandom`)
is good; the third-party ecosystem (`cryptography`, `pycryptodome`) is
excellent.

The single most common bug: **using `random` instead of `secrets` or
`os.urandom`** for key material. `random.random()` is a Mersenne Twister
seeded with `time.time()` by default — predictable across an entire lab.

## Run it

```bash
cd modules/13-python
python -m pip install --user pytest pycryptodome
python -m pytest -q
```

## Python-specific gotchas (the canonical list)

| Bug | Fix |
|-----|-----|
| `random.randbytes(32)` | `os.urandom(32)` or `secrets.token_bytes(32)` |
| `==` on `bytes` | `hmac.compare_digest(a, b)` (constant-time) |
| `b'abc'.hex()` vs `"abc"` | keep everything as `bytes`; `hex()` only at boundaries |
| `hmac.new(key=bytes)` w/ short key | pad with zeros silently; OK |
| Truncating a tag | `hmac.compare_digest` requires equal-length |
| `pickle.loads` on attacker data | never unpickle remotely; `hmac.compare_digest` it |
| Encoding `bytes` as `str` | `bytes.hex()` (no encoding guess) |

## Files

```
src/learncrypto/
  ciphers.py        AES-256-GCM via cryptography.hazmat
  macs.py           hmac.compare_digest
  hashes.py         hashlib + HKDF
  ed25519.py        cryptography.hazmat Ed25519
  csprng.py         secrets vs random demonstration
tests/
  test_contract.py  the six properties
```

## Exercises

1. Implement HKDF in *pure Python* (no `cryptography`) and verify it matches
   RFC 5869 vector 1.
2. Use `inspect.getsource` and `ast.parse` to write a custom linter that
   blocks `import random` in any file with `secret` in its docstring.
3. Implement OAEP from RSA-OAEP (PKCS#1 v2.2 §7.1).
4. Read a `pyca` blog post on AES-GCM nonce-resilience and implement
   `secretbox` from libsodium on top of `cryptography`.
