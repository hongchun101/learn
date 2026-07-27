# Module 18 · Capstone Challenge

> Build a TLS 1.3-style authenticated key exchange from first principles,
> then deliberately break it and patch it.

## What you will learn

The previous 17 modules gave you the pieces; this one is the assembly. You will:

1. Build an AEAD-encrypted channel using X25519 + HKDF-SHA-256 + AES-256-GCM
   + Ed25519 signatures.
2. Run a man-in-the-middle attack on the *unauthenticated* version.
3. Patch the protocol with signed ephemeral keys (Noise IK pattern).
4. Add forward secrecy by deriving a fresh key per session.
5. Add a transcript binding (challenge cookies).
6. Test your implementation against the contract tests, then prove your
   protocol by attacking a peer implementation.

## Tasks

### Task 1 — Implement Noise IK with X25519 + AES-GCM + Ed25519

The protocol transcript:

```
Init → Response                                  │
   Prologue: "my-application/0"                   │
                                                  │
e   = E_25519(responder_pub, ephemeral_init)     # 32 字节，加密链 →
s   = SIGN(sk_init, e || rs)                      # 64 字节，对临时公钥签名
es  = E_25519(responder_pub, e)                  # 32 字节
ee  = E_25519(e, rs)                              # 32 字节
                                                  │
payload_1 = ENC(encrypt_key, "auth-string-1" + msg_1)
                                                  │
Response → Ack                                    │
payload_2 = ENC(encrypt_key, "auth-string-2" + msg_2)
```

This produces two shared secrets `(es, ee)` from which an AEAD key is derived
via HKDF-Extract+Expand. Both sides then transmit encrypted payloads.

### Task 2 — MITM the unauthenticated version

Run `npm run capstone:naive`. Send `{"alice": "keyA"}` from Alice to Bob via
the attacker E. Observe:

- The attacker's key material `priv_e` cannot decrypt.
- The attacker rewrites `(alice → alice)` and observes the message.

### Task 3 — Add signatures

Run `npm run capstone:signed`. Now Ed25519-signed ephemeral keys prevent the
attack from task 2. The attacker can still drop packets but cannot forge.

### Task 4 — Add replay protection

Run `npm run capstone:replay`. Each session number is unique; nonce reuse
becomes impossible.

### Task 5 — Forward secrecy test

Run `npm run capstone:fs`. Recover the static key, observe that old
sessions *cannot* be recovered (the master secret only depends on
ephemeral keys).

## Files

```
src/
  protocol.ts       — the canonical "my protocol" implementation
  crypto-util.ts    — X25519, HKDF, Ed25519, AES-GCM helpers
  broken-mitm.ts    — a MITM setup that proves the vulnerability
  patched-signed.ts — the patched version with signatures
  attack.ts         — the breaker that attacks the broken version
tests/
  contract.test.ts  — the six-channel property tests on the protocol
  replay.test.ts    — replay protection
  forward-secret.test.ts — long-term-key compromise test
```

## Run it

```bash
cd modules/18-capstone
npx vitest run                         # 12+ 个测试
npm run capstone                      # 交互式演示
npm run capstone:naive                # 演示中间人攻击生效
npm run capstone:signed               # 演示中间人攻击失败
```

## The expected outcome

After completing this module you should:

- Read TLS 1.3 specification (RFC 8446) and recognise every primitive.
- Read Noise Protocol Framework and identify the pattern IK.
- Implement the IK pattern in any language with confidence.
- Identify which kind of attack breaks which kind of protocol.

That last point is the marker of expert-level cryptography understanding:
you should be able to look at any protocol, identify the vulnerable gap,
and propose an attack that *demonstrably* succeeds on the broken version.
