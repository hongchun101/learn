/**
 * Module 01 — Classical ciphers & their breakable-by-construction attacks.
 *
 * Educational only. Never use any of these primitives for real protection.
 *
 * Three demonstrations:
 *   1. Caesar cipher — break in ≤ 26 tries.
 *   2. Vigenère cipher — break via Index of Coincidence + Kasiski.
 *   3. Two-Time Pad — break via crib-dragging (the OTP's forbidden mistake).
 *
 * Nothing here touches the §6 cross-chapter contract; this is background work.
 */

// ===========================================================================
// Caesar
// ===========================================================================

export function caesarEncrypt(m: string, k: number): string {
  const shift = ((k % 26) + 26) % 26;
  return m.replace(/[A-Za-z]/g, (c) => {
    const base = c < 'a' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
  });
}

export function caesarBreak(c: string): { shift: number; plain: string } {
  // English-letter frequency (probability of each letter).
  const ENG: Record<string, number> = {
    e: 0.127, t: 0.091, a: 0.082, o: 0.075, i: 0.070,
    n: 0.067, s: 0.063, h: 0.061, r: 0.060, d: 0.043,
    l: 0.040, c: 0.028, u: 0.028, m: 0.024, w: 0.024,
    f: 0.022, g: 0.020, y: 0.020, p: 0.019, b: 0.015,
    v: 0.010, k: 0.008, j: 0.002, x: 0.002, q: 0.001,
    z: 0.001,
  };
  const lower = c.toLowerCase().replace(/[^a-z]/g, '');
  let bestScore = -Infinity, bestShift = 0;
  for (let shift = 0; shift < 26; shift++) {
    let score = 0;
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i] ?? 'a';
      const decIdx = (ch.charCodeAt(0) - 97 - shift + 26) % 26;
      const decCh = String.fromCharCode(97 + decIdx);
      score += ENG[decCh] ?? 0;
    }
    if (score > bestScore) { bestScore = score; bestShift = shift; }
  }
  return { shift: bestShift, plain: caesarEncrypt(c, -bestShift) };
}

// ===========================================================================
// Vigenère
// ===========================================================================

export function vigenereEncrypt(m: string, key: string): string {
  return vigenereTransform(m, key, +1);
}

export function vigenereDecrypt(c: string, key: string): string {
  return vigenereTransform(c, key, -1);
}

function vigenereTransform(m: string, key: string, dir: 1 | -1): string {
  const k = key.toLowerCase();
  let ki = 0;
  return m.replace(/[A-Za-z]/g, (c) => {
    const base = c < 'a' ? 65 : 97;
    const kc = (k.charCodeAt((ki++) % k.length) - 97);
    const v  = ((c.charCodeAt(0) - base) + dir * kc + 26) % 26;
    return String.fromCharCode(v + base);
  });
}

/** Index of coincidence. English ≈ 0.0667; uniformly random ≈ 0.0385. */
export function ic(text: string): number {
  const t = text.toLowerCase().replace(/[^a-z]/g, '');
  if (t.length < 2) return 0;
  const counts = new Array(26).fill(0);
  for (const ch of t) counts[ch.charCodeAt(0) - 97]++;
  let sum = 0;
  for (const n of counts) sum += n * (n - 1);
  return sum / (t.length * (t.length - 1));
}

/** Estimate Vigenère key length by IC over shifted versions of the ciphertext. */
export function vigenereKeyLength(c: string, maxLen = 12): number {
  const t = c.toLowerCase().replace(/[^a-z]/g, '');
  if (t.length === 0) return 0;
  let bestScore = -Infinity, bestLen = 1;
  for (let L = 1; L <= maxLen; L++) {
    const cols: string[] = Array.from({ length: L }, () => '');
    for (let i = 0; i < t.length; i++) (cols[i % L] as string) += t[i] ?? '';
    const avg = cols.reduce((acc, col) => acc + ic(col), 0) / L;
    if (avg > bestScore) { bestScore = avg; bestLen = L; }
  }
  return bestLen;
}

export function vigenereBreak(c: string): { key: string; plain: string } {
  const L = vigenereKeyLength(c, 8);
  const t = c.toLowerCase().replace(/[^a-z]/g, '');
  // Lowercase letters ordered by frequency in English.
  const ENG = 'etaoinshrdlcumwfgypbvkjxqz';
  const cols: string[][] = [];
  for (let j = 0; j < L; j++) cols.push([]);
  for (let i = 0; i < t.length; i++) cols[i % L]!.push(t[i] ?? '');
  let key = '';
  for (const col of cols) {
    let bestShift = 0, bestScore = Infinity;
    for (let shift = 0; shift < 26; shift++) {
      let score = 0;
      for (const ch of col) {
        const idx = (ch.charCodeAt(0) - 97 - shift + 26) % 26;
        score += ENG.indexOf(String.fromCharCode(97 + idx));
      }
      if (score < bestScore) { bestScore = score; bestShift = shift; }
    }
    key += String.fromCharCode(97 + bestShift);
  }
  return { key, plain: vigenereDecrypt(c, key) };
}

// ===========================================================================
// Two-Time Pad (the canonical OTP misuse)
// ===========================================================================

export function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.min(a.length, b.length));
  for (let i = 0; i < out.length; i++) {
    out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return out;
}

export function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function fromBytes(b: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(b);
}

/** When the same OTP is reused, c1 ⊕ c2 = m1 ⊕ m2 — XOR of two plaintexts,
 *  biased by natural language redundancy. Statistically recoverable. */
export function twoTimePadRecover(c1: Uint8Array, c2: Uint8Array): Uint8Array {
  return xorBytes(c1, c2);
}

// ===========================================================================
// Demoes (run via `tsx`)
//
// `execute()` prints what each attack produces.
// ===========================================================================

export function execute(): void {
  console.log('=== Caesar (shift 3, "hello world") ===');
  const caesarC = caesarEncrypt('hello world', 3);
  console.log(' ciphertext:', caesarC);
  console.log('   broken  :', caesarBreak(caesarC));

  console.log('\n=== Vigenère (key "lemon") ===');
  const ven = vigenereEncrypt('we are discovered flee at once', 'lemon');
  console.log(' ciphertext:', ven);
  const venBreak = vigenereBreak(ven);
  console.log('   broken  : key=', venBreak.key, 'plain=', venBreak.plain);

  console.log('\n=== Two-Time Pad (same key, two messages) ===');
  const k = toBytes('supersecretkey');
  const m1 = toBytes('attack at dawn');
  const m2 = toBytes('attack at dusk');
  const c1 = xorBytes(m1, k);
  const c2 = xorBytes(m2, k);
  const recovered = twoTimePadRecover(c1, c2);
  console.log(' c1 ⊕ c2  :', fromBytes(recovered), '(equals m1 ⊕ m2; crib-drag to recover)');
}

if (process.argv[1]?.endsWith('classical-cipher-attack.ts')) {
  execute();
}
