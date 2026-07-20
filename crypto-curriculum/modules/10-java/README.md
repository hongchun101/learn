# Module 10 · Java 8+ Reference

> The same six primitives, in the language with the largest production footprint.

## Why Java gets its own module

Java has more crypto infrastructure in production than any other language —
but it also has more ways to get it wrong:

- `byte[]` is signed; mixing `int` and `byte` produces sign-extension bugs.
- `String.getBytes("UTF-8")` and `new BigInteger(radix)` cause "encoding =
  string conversion" anomalies.
- `SecureRandom` *must* be used; `Math.random()` is not seeded securely.
- `KeyFactory.getInstance("RSA")` defaults to PKCS#1 v1.5 padding (Bleichenbauch!).
- `Cipher.init(... RSA/ECB/PKCS1Padding ...)` pads differently for encryption
  vs signing — never copy-paste without checking.

This module is the canonical "if you're putting crypto in a Spring service,
this is the minimum you must verify."

## What this module proves

The same six primitives (challenge 1 – 6) implemented in Java 8 with the JDK
only — no third-party libraries.

| # | Primitive | Java API used |
|---|-----------|----------------|
| 1 | AES-256-GCM | `javax.crypto.Cipher("AES/GCM/NoPadding")` + 12-byte IV |
| 2 | HMAC-SHA-256 | `javax.crypto.Mac(HmacSHA256)` |
| 3 | SHA-256 | `java.security.MessageDigest("SHA-256")` |
| 4 | HKDF-SHA-256 | HMAC + custom Extract/Expand loop |
| 5 | Ed25519 | `java.security.KeyFactory` (Ed25519 is JDK 15+ via `EdDSA`, see notes) |
| 6 | CSPRNG | `java.security.SecureRandom` |

> Ed25519 in Java pre-15: requires BouncyCastle (not JDK-only). In JDK 15+,
> `KeyFactory.getInstance("Ed25519")` works. This module targets JDK 8
> (which is what this host has available), so we ship HKDF + AES + HMAC
> runnable, and Ed25519 as *asserted behaviour* via `EdDSA` if available,
> falling back to a documented "use Bouncy Castle" hint.

## Run it

```bash
cd modules/10-java
mkdir -p target
javac -d target src/io/learncrypto/*.java
java -ea -cp target io.learncrypto.TestSuite
```

## Files

```
src/io/learncrypto/
  Ciphers.java          AES-256-GCM encrypt/decrypt
  Macs.java             HMAC-SHA-256 sign/verify
  Hashes.java           SHA-256 + HKDF-SHA-256
  Ed25519.java          Ed25519 (EdDSA) — JDK 15+ runtime, JDK 8 placeholder
  Csprng.java           SecureRandom
  TestSuite.java        main() — runs every contract test
```

## Java-specific gotchas you must know

1. **Don't use `Cipher.getInstance("RSA")`** — it picks a provider default.
   Use `"RSA/ECB/OAEPWithSHA-256AndMGF1Padding"` for encryption,
   `"RSA/ECB/PKCS1Padding"` for signing is broken — use `RSA-PSS`.
2. **`String#getBytes()`** uses the platform default — *always* pass a charset.
3. **`SecureRandom` vs `Math.random`** — `Math.random()` is not seeded
   securely; even seeded from `SecureRandom`, it must not be used for
   session keys.
4. **`byte[i] & 0xFF`** when converting to int (avoid sign-extension).
5. **`MessageDigest.digest` returns bytes; "compare hashes" requires
   `MessageDigest.isEqual` (constant-time since Java 7u72).**
6. **Don't use `==` on `byte[]`.** Use `Arrays.equals` or, better,
   `MessageDigest.isEqual` for secrets.

## Exercises (Java)

1. Implement `OAEP` from scratch in Java, test it against the JDK's
   `RSA/ECB/OAEPWithSHA-256AndMGF1Padding` for `n=2048`.
2. Implement HKDF-SHA-256 from RFC 5869 vector 1.
3. Make `Cipher` constant-time on decrypt — a `final` field + early throw
   shouldn't reveal the failure point.
4. Compare Bouncy Castle's `Ed25519` (provider class) with `EdDSA` if/when
   available.
