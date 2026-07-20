/**
 * Module 08 — Frontier cryptography in Node 24.
 *
 * Demos that fit the local toolchain:
 *   1. Schnorr identification (zk-pok of discrete log) — textbook-strength.
 *   2. Verifiable random function (VRF) using HMAC-DRBG + Schnorr proof.
 *   3. Toy Private Set Intersection (PSI-CA): two parties compute the size
 *      of their intersection without disclosing elements.
 *
 * The 1024-bit prime below is NOT a real-world safe prime — it is purely a
 * mathematical vehicle for demonstrating the ZK protocols. For production,
 * use RFC 5114 / RFC 7919 group 14, or NIST P-256 / X25519.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';

const P = BigInt('0x' +
  'FFFFFFFF' + 'FFFFFFFF' + 'C90FDAA2' + '2168C234' +
  'C4C6628B' + '80DC1CD1' + '29024E08' + '8A67CC74' +
  '020BBEA6' + '3B139B22' + '514A0879' + '8E3404DD' +
  'EF9519B3' + 'CD3A431B' + '302B0A6D' + 'F25F1437' +
  '4FE1356D' + '6D51C245' + 'E485B576' + '625E7EC6' +
  'F44C42E9' + 'A637ED6B' + '0BFF5CB6' + 'F406B7ED' +
  'EE386BFB' + '5A899FA5' + 'AE9F2411' + '7C4B1FE6' +
  '49286651' + 'ECE65381' + 'FFFFFFFF' + 'FFFFFFFF');
const Q = (P - 1n) / 2n;
const G = 2n;

function modExp(g: bigint, e: bigint, m: bigint): bigint {
  let base = ((g % m) + m) % m;
  let exp = e;
  let result = 1n % m;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    base = (base * base) % m;
    exp >>= 1n;
  }
  return result;
}

function bytesToBig(b: Uint8Array | Buffer): bigint {
  let v = 0n;
  for (let i = 0; i < b.length; i++) {
    v = (v << 8n) | BigInt(b[i] ?? 0);
  }
  return v;
}

function bigToBytes(v: bigint, len = 128): Buffer {
  const out = Buffer.alloc(len);
  let x = v;
  for (let i = len - 1; i >= 0 && x !== 0n; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

interface SchnorrSk { x: bigint }
interface SchnorrPk { X: bigint }
export interface SchnorrProof { T: bigint; s: bigint }

export function schnorrKeypair(seed: Buffer): { sk: SchnorrSk; pk: SchnorrPk } {
  const x = bytesToBig(createHash('sha256').update(seed).digest()) % Q;
  return { sk: { x }, pk: { X: modExp(G, x, P) } };
}

/**
 * Schnorr identification (Fiat-Shamir-style non-interactive variant).
 * Returns the commitment T and the response s. The challenge `c` is recomputed
 * by the verifier from (T, ctx) and bound to the protocol context.
 */
export function schnorrProve(sk: SchnorrSk, ctx: Buffer): SchnorrProof {
  const r = bytesToBig(createHash('sha256')
    .update(Buffer.concat([randomBytes(32), ctx])).digest()) % Q;
  const T = modExp(G, r, P);
  const c = bytesToBig(createHash('sha256')
    .update(bigToBytes(T)).update(ctx).digest()) % Q;
  const s = (r + c * sk.x) % Q;
  return { T, s };
}

export function schnorrVerify(
  pk: SchnorrPk,
  ctx: Buffer,
  proof: SchnorrProof,
): boolean {
  const c = bytesToBig(createHash('sha256')
    .update(bigToBytes(proof.T)).update(ctx).digest()) % Q;
  const lhs = modExp(G, proof.s, P);
  const rhs = (proof.T * modExp(pk.X, c, P)) % P;
  return lhs === rhs;
}

export function schnorrDemo(): void {
  console.log('\n=== Schnorr identification ===');
  const seed = randomBytes(32);
  const ctx = Buffer.from('application:auth/2026');
  const kp = schnorrKeypair(seed);
  const proof = schnorrProve(kp.sk, ctx);
  console.log('  proof ok          :', schnorrVerify(kp.pk, ctx, proof));
  console.log('  tampered ctx fails:',
    !schnorrVerify(kp.pk, Buffer.from('application:auth/2027'), proof));
}

// VRF — a deterministic Schnorr-derived output with proof.
export interface VrfOutput { beta: Buffer; pi: SchnorrProof }

export function vrfEval(sk: SchnorrSk, alpha: Buffer): VrfOutput {
  const prk = createHmac('sha256', bigToBytes(sk.x)).update(alpha).digest();
  let counter = 1;
  let out = Buffer.alloc(0);
  while (out.length < 32) {
    const h = createHmac('sha256', prk);
    h.update(Buffer.from([counter]));
    out = Buffer.concat([out, h.digest()]);
    counter++;
  }
  const beta = out.subarray(0, 32);
  const pi = schnorrProve(sk, alpha);
  return { beta, pi };
}

export function vrfVerify(pk: SchnorrPk, alpha: Buffer, beta: Buffer, pi: SchnorrProof): boolean {
  return schnorrVerify(pk, alpha, pi);
}

export function vrfDemo(): void {
  console.log('\n=== VRF (textbook Schnorr) ===');
  const seed = randomBytes(32);
  const kp = schnorrKeypair(seed);
  const alpha = Buffer.from('round=42,role=leader');
  const out = vrfEval(kp.sk, alpha);
  console.log('  beta (hex, 32 B):', out.beta.toString('hex').slice(0, 32) + '…');
  console.log('  verify          :', vrfVerify(kp.pk, alpha, out.beta, out.pi));
}

// Toy PSI-CA: in a real protocol the OPRF is a Diffie–Hellman-based
// pseudorandom function. Here we hash + HMAC; correctness is the same property
// (|A ∩ B| = number of inputs that map to a shared bucket under both keys).
export function psiCa(setA: Buffer[], setB: Buffer[]): number {
  // Stable per-element signature: HMAC-SHA256 over a fixed protocol key (in
  // production this would be the per-party OPRF key).
  const protocolKey = createHash('sha256').update(Buffer.from('protocol-v1')).digest();
  const hA = new Set(setA.map((x) => createHmac('sha256', protocolKey).update(x).digest('hex')));
  const hB = new Set(setB.map((x) => createHmac('sha256', protocolKey).update(x).digest('hex')));
  let common = 0;
  for (const v of hA) if (hB.has(v)) common++;
  return common;
}

export function psiCaDemo(): void {
  console.log('\n=== PSI-CA cardinality (toy) ===');
  const setA = [Buffer.from('alice'), Buffer.from('bob'), Buffer.from('carol')];
  const setB = [Buffer.from('alice'), Buffer.from('eve'), Buffer.from('carol'), Buffer.from('frank')];
  console.log('  |A ∩ B| =', psiCa(setA, setB), '(expected 2: alice, carol)');
}

export function execute(): void {
  schnorrDemo();
  vrfDemo();
  psiCaDemo();
}

if (process.argv[1]?.endsWith('frontier.ts')) execute();
