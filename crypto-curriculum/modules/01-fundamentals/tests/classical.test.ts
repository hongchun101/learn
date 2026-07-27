import { describe, it, expect } from 'vitest';
import {
  caesarEncrypt,
  caesarBreak,
  vigenereEncrypt,
  vigenereDecrypt,
  vigenereBreak,
  vigenereKeyLength,
  xorBytes,
  twoTimePadRecover,
  toBytes,
} from '../src/classical-cipher-attack.js';

describe('classical: Caesar', () => {
  it('round-trips for any shift', () => {
    expect(caesarEncrypt(caesarEncrypt('hello', 7), -7)).toBe('hello');
  });

  it('breaks any Caesar ciphertext by frequency', () => {
    const plaintext =
      'the quick brown fox jumps over the lazy dog the quick brown fox jumps over the lazy dog';
    for (const k of [3, 7, 13, 21]) {
      const c = caesarEncrypt(plaintext, k);
      const broken = caesarBreak(c);
      expect(broken.shift).toBe(k);
      expect(broken.plain).toBe(plaintext);
    }
  });
});

describe('classical: Vigenere', () => {
  it('round-trips for the known key', () => {
    const m = 'attack at dawn';
    const k = 'lemon';
    expect(vigenereDecrypt(vigenereEncrypt(m, k), k)).toBe(m);
  });

  it('recovers the key on long plaintext (IC + frequency match)', () => {
    // 文本足够长时 IC 才会收敛，然后频率匹配逐位找出每个移位。
    const plain = ('we are discovered flee at once we are discovered flee at once ' +
      'send all available forces to the harbor send all available forces to ' +
      'the harbor we have secured the bridge and are holding position ' +
      'if the enemy retreats we hold the bridge if the enemy advances we ' +
      'burn it and fall back to the secondary line of defense ' +
      'the signal lamp on the south tower is the visual cue for the attack').repeat(2);
    const c = vigenereEncrypt(plain, 'lemon');
    const r = vigenereBreak(c);
    expect(r.key).toBe('lemon');
  });

  it('vigenereKeyLength is at least 1 and at most maxLen', () => {
    const plain = ('the quick brown fox jumps over the lazy dog ').repeat(40);
    const c = vigenereEncrypt(plain, 'lemon');  // L = 5
    const est = vigenereKeyLength(c, 8);
    expect(est).toBeGreaterThanOrEqual(1);
    expect(est).toBeLessThanOrEqual(8);
  });
});

describe('classical: Two-Time Pad reveal', () => {
  it('XOR of two ciphertexts equals XOR of two plaintexts', () => {
    const k = toBytes('supersecretkey');
    const m1 = toBytes('attack at dawn');
    const m2 = toBytes('attack at dusk');
    const c1 = xorBytes(m1, k);
    const c2 = xorBytes(m2, k);
    const recover = twoTimePadRecover(c1, c2);
    const expected = xorBytes(m1, m2);
    expect(recover).toEqual(expected);
  });
});
