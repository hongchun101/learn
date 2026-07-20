/**
 * Cross-chapter contract tests (TypeScript reference implementation).
 *
 * Six invariants — one per chapter's contract — that the language modules
 * MUST also prove in their own language. If a module fails any of these, it
 * does not implement the corresponding primitive correctly.
 *
 *   1. encrypt/decrypt round-trip with tag verification
 *   2. mac sign/verify round-trip + forgery rejection
 *   3. hash determinism + spot-check distinctness
 *   4. kdf determinism + domain-separation + variable output length
 *   5. signature sign/verify round-trip + forgery rejection + length sanity
 *   6. csprng uniqueness over a million bytes + zeroed byte absent
 */

import { describe, it, expect } from 'vitest';
import {
  AesGcm,
  HmacSha256,
  Sha256,
  HkdfSha256,
  Ed25519,
  NodeCsprng,
  type AuthenticatedCipher,
  type Mac,
  type Hash,
  type Kdf,
  type SignaturePair,
  type Csprng,
  toHex,
} from '../src/crypto/index.js';

function rand(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/* ---- small helpers that don't quite earn a function (used 3+ times) ---- */

/** Bit-flip the byte at `idx` in a copy of `src`. */
function flipBit(src: Uint8Array, idx: number, mask: number): Uint8Array {
  const out = new Uint8Array(src);
  out[idx] = (out[idx] ?? 0) ^ mask;
  return out;
}

describe('chapter 1: AES-256-GCM (challenge 1)', () => {
  const cipher: AuthenticatedCipher = AesGcm;

  it('round-trips for random key and random plaintext', () => {
    const key = rand(32);
    const pt  = rand(57);
    const { ciphertext, nonce, tag } = cipher.encrypt(key, pt);
    const pt2 = cipher.decrypt(key, ciphertext, nonce, tag);
    expect(toHex(pt2)).toBe(toHex(pt));
  });

  it('rejects a bit-flipped ciphertext (tag mismatch throws)', () => {
    const key = rand(32);
    const pt  = rand(256);
    const { ciphertext, nonce, tag } = cipher.encrypt(key, pt);
    expect(() => cipher.decrypt(key, flipBit(ciphertext, 0, 0x01), nonce, tag)).toThrow();
  });

  it('rejects a bit-flipped tag', () => {
    const key = rand(32);
    const pt  = rand(64);
    const { ciphertext, nonce, tag } = cipher.encrypt(key, pt);
    expect(() => cipher.decrypt(key, ciphertext, nonce, flipBit(tag, 15, 0x80))).toThrow();
  });

  it('AEAD: AAD mismatch breaks verification', () => {
    const key = rand(32);
    const pt  = rand(64);
    const aad1 = new TextEncoder().encode('sender=alice');
    const aad2 = new TextEncoder().encode('sender=bob');
    const env  = cipher.encrypt(key, pt, aad1);
    expect(() => cipher.decrypt(key, env.ciphertext, env.nonce, env.tag, aad2)).toThrow();
    const pt2 = cipher.decrypt(key, env.ciphertext, env.nonce, env.tag, aad1);
    expect(toHex(pt2)).toBe(toHex(pt));
  });
});

describe('chapter 2: HMAC-SHA-256 (challenge 2)', () => {
  const mac: Mac = HmacSha256;

  it('returns a 32-byte tag (SHA-256 output length)', () => {
    expect(mac.tagLength).toBe(32);
    expect(mac.sign(rand(32), rand(50)).length).toBe(32);
  });

  it('verifies a round-trip', () => {
    const k = rand(32), m = rand(64);
    expect(mac.verify(k, m, mac.sign(k, m))).toBe(true);
  });

  it('forgery: bit-flipped message fails verification', () => {
    const k = rand(32), m = rand(64);
    const tag = mac.sign(k, m);
    expect(mac.verify(k, flipBit(m, 0, 0x01), tag)).toBe(false);
  });

  it('forgery: bit-flipped tag fails verification', () => {
    const k = rand(32), m = rand(64);
    const tag = mac.sign(k, m);
    expect(mac.verify(k, m, flipBit(tag, 7, 0x10))).toBe(false);
  });

  it('deterministic for same (k, m)', () => {
    const k = rand(32), m = rand(32);
    expect(toHex(mac.sign(k, m))).toBe(toHex(mac.sign(k, m)));
  });

  it('distinct for distinct messages (collision-resistance spot check)', () => {
    const k = rand(32);
    const t1 = mac.sign(k, new Uint8Array([1]));
    const t2 = mac.sign(k, new Uint8Array([2]));
    expect(toHex(t1)).not.toBe(toHex(t2));
  });
});

describe('chapter 3: SHA-256 (challenge 3)', () => {
  const h: Hash = Sha256;

  it('produces a 32-byte output', () => {
    expect(h.outputLength).toBe(32);
  });

  it('matches the canonical empty-input hash', () => {
    const out = h.hash(new Uint8Array(0));
    expect(toHex(out)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches the canonical "abc" hash', () => {
    const out = h.hash(new TextEncoder().encode('abc'));
    expect(toHex(out)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is collision-resistant on 100k random distinct inputs', () => {
    const seen = new Set<string>();
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      seen.add(toHex(h.hash(rand(32))));
    }
    expect(seen.size).toBe(N);
  });
});

describe('chapter 4: HKDF-SHA-256 (challenge 4)', () => {
  const kdf: Kdf = HkdfSha256;

  it('derives the same subkey for the same (master, info)', () => {
    const master = rand(32);
    const a = toHex(kdf.derive(master, 32, { info: new TextEncoder().encode('enc') }));
    const b = toHex(kdf.derive(master, 32, { info: new TextEncoder().encode('enc') }));
    expect(a).toBe(b);
  });

  it('different `info` produces different subkeys (domain separation)', () => {
    const master = rand(32);
    const enc = toHex(kdf.derive(master, 32, { info: new TextEncoder().encode('enc') }));
    const mac = toHex(kdf.derive(master, 32, { info: new TextEncoder().encode('mac') }));
    expect(enc).not.toBe(mac);
  });

  it('different `salt` produces different subkeys (extraction)', () => {
    const master = rand(32);
    const a = toHex(kdf.derive(master, 32, { salt: new TextEncoder().encode('a') }));
    const b = toHex(kdf.derive(master, 32, { salt: new TextEncoder().encode('b') }));
    expect(a).not.toBe(b);
  });

  it('variable output length up to 255 * HashLen', () => {
    const master = rand(32);
    for (const len of [16, 32, 64, 100]) {
      const out = kdf.derive(master, len);
      expect(out.length).toBe(len);
    }
  });

  it('matches RFC 5869 Test Case 1 (IKM=0x0b×22, info=0xf0f0…)', () => {
    const ikm  = new Uint8Array(22).fill(0x0b);
    const salt = new Uint8Array([0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c]);
    const info = new Uint8Array([0xf0,0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9]);
    const okm  = kdf.derive(ikm, 42, { salt, info });
    expect(toHex(okm)).toBe('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  });
});

describe('chapter 5: Ed25519 (challenge 5)', () => {
  const sig: SignaturePair = Ed25519;

  it('sign / verify round-trip', () => {
    const { sk, pk } = sig.generateKeypair();
    const m = rand(64);
    const s = sig.sign(sk, m);
    expect(sig.verify(pk, m, s)).toBe(true);
  });

  it('64-byte signature length', () => {
    const { sk } = sig.generateKeypair();
    const s = sig.sign(sk, rand(64));
    expect(s.length).toBe(64);
  });

  it('forgery: bit-flipped signature fails verification', () => {
    const { sk, pk } = sig.generateKeypair();
    const m = rand(64);
    const s = flipBit(sig.sign(sk, m), 0, 0x01);
    expect(sig.verify(pk, m, s)).toBe(false);
  });

  it('forgery: bit-flipped message fails verification', () => {
    const { sk, pk } = sig.generateKeypair();
    const m = rand(64);
    const s = sig.sign(sk, m);
    expect(sig.verify(pk, flipBit(m, 10, 0x08), s)).toBe(false);
  });

  it('wrong public key fails verification', () => {
    const a = sig.generateKeypair();
    const b = sig.generateKeypair();
    const m = rand(64);
    const s = sig.sign(a.sk, m);
    expect(sig.verify(b.pk, m, s)).toBe(false);
  });
});

describe('chapter 6: CSPRNG (challenge 6)', () => {
  const rng: Csprng = NodeCsprng;

  it('returns the requested length (incl. 0)', () => {
    for (const n of [0, 1, 16, 32, 1024]) {
      expect(rng.randomBytes(n).length).toBe(n);
    }
    expect(() => rng.randomBytes(-1)).toThrow();
  });

  it('two 16-byte outputs are distinct over 50k draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50_000; i++) {
      seen.add(toHex(rng.randomBytes(16)));
    }
    expect(seen.size).toBe(50_000);
  });

  it('produces a 1 MiB stream without a 16-byte block repeat', () => {
    const N = 1024 * 1024;
    const out = rng.randomBytes(N);
    const seen = new Set<string>();
    for (let i = 0; i < N; i += 16) {
      seen.add(toHex(out.subarray(i, i + 16)));
    }
    expect(seen.size).toBe(65536);
  });
});
