// Deterministic, audit-able RNG. Not for production — chains use the CSPRNG
// exposed by the host. Used here so tests and demos are reproducible.

import { sha256 } from './01-cryptography/hashes.js';

export class DeterministicRng {
  private state: Uint8Array;

  constructor(seed: Uint8Array) {
    if (seed.length < 16) {
      throw new Error('Seed must be at least 16 bytes');
    }
    this.state = sha256(seed);
  }

  /** Pull `n` random bytes from the stream (SHA-256 counter mode). */
  next(n: number): Uint8Array {
    let counter = 0n;
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      counter += 1n;
      const ctrBytes = new Uint8Array(32);
      ctrBytes[ctrBytes.length - 1] = Number(counter & 0xffn);
      const block = sha256(this.concat(this.state, ctrBytes));
      const take = Math.min(block.length, n - filled);
      out.set(block.subarray(0, take), filled);
      filled += take;
      this.state = block;
    }
    return out;
  }

  private concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }
}

/** Draw a 32-byte seed from a hex or utf-8 string. */
export function seedFrom(value: string): Uint8Array {
  return sha256(new TextEncoder().encode(value));
}
