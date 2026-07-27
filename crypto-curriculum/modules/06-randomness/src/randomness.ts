/**
 * 模块 06 —— 随机数、KDF 与密钥管理。
 *
 * 示例：
 *   1. Node CSPRNG 健全性（无零字节；连续多个零字节极不可能出现）。
 *   2. `crypto.scrypt`（在内存成本方面最接近 Argon2id 的标准库 KDF）。
 *   3. HKDF 链接——通过域名分隔从一个主密钥派生多个子密钥。
 */

import { randomBytes, scryptSync, hkdfSync } from 'node:crypto';

// ---------------------------------------------------------------------------
// 1. CSPRNG 健全性。
// ---------------------------------------------------------------------------

export function csprngSanity(): void {
  console.log('\n=== CSPRNG sanity ===');
  const N = 1024 * 1024;
  const buf = randomBytes(N);
  let zeros = 0;
  for (const b of buf) if (b === 0) zeros++;
  console.log(`  ${N} random bytes, zero-count =`, zeros,
    `(expected ≈ ${N}/256 ≈ ${(N / 256).toFixed(1)}; ⟂ to pattern)`);
}

// ---------------------------------------------------------------------------
// 2. scrypt KDF（标准库内最接近的 KDF）。
// ---------------------------------------------------------------------------

export function scryptKdf(): void {
  console.log('\n=== scrypt KDF (salt + password → 32-byte key) ===');
  const pw  = Buffer.from('correct horse battery staple');
  const salt = randomBytes(16);
  const t0 = process.hrtime.bigint();
  const k = scryptSync(pw, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const t1 = process.hrtime.bigint();
  console.log('  key                 :', k.toString('hex').slice(0, 24) + '…');
  console.log('  derivation time (ms):', Number(t1 - t0) / 1_000_000);
  // 对相同 (pw, salt, params) 是确定的
  const k2 = scryptSync(pw, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  console.log('  deterministic       :', k.toString('hex') === k2.toString('hex'));
}

// ---------------------------------------------------------------------------
// 3. HKDF 链接——从一个主密钥派生三个子密钥。
// ---------------------------------------------------------------------------

export function hkdfChained(): void {
  console.log('\n=== HKDF chained subkeys ===');
  const master = randomBytes(32);
  const get = (info: string) => Buffer.from(hkdfSync('sha256', master, new Uint8Array(0),
    Buffer.from(info), 32));
  const aesKey  = get('aes-key');
  const macKey  = get('mac-key');
  const tokenKey = get('token-key');
  console.log('  aes-key   :', aesKey.toString('hex').slice(0, 24) + '…');
  console.log('  mac-key   :', macKey.toString('hex').slice(0, 24) + '…');
  console.log('  token-key :', tokenKey.toString('hex').slice(0, 24) + '…');
  console.log('  all distinct             :', !aesKey.equals(macKey) && !aesKey.equals(tokenKey));
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function execute(): void {
  csprngSanity();
  scryptKdf();
  hkdfChained();
}

if (process.argv[1]?.endsWith('randomness.ts')) execute();
