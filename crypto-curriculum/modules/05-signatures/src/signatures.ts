/**
 * 模块 05 —— Node 24 中的签名。
 *
 * 示例：
 *   1. Ed25519：往返 + 伪造检测。
 *   2. ECDSA-P256 / SHA-256：签名长度在 64-72 字节（DER 编码）。
 *   3. RSA-PSS：唯一安全的 RSA 签名填充模式。
 */

import { generateKeyPairSync, sign, verify, randomBytes, createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Ed25519。
// ---------------------------------------------------------------------------

export function ed25519Demo(): void {
  console.log('\n=== Ed25519 ===');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const m  = Buffer.from('sign me');
  const s1 = sign(null, m, privateKey);
  const s2 = sign(null, m, privateKey); // 按 RFC 8032 是确定的
  console.log('  signature length   :', s1.length, '(==64)');
  console.log('  same m → same sig  :', s1.equals(s2), '(Ed25519 is deterministic)');
  console.log('  verify(original)   :', verify(null, m, publicKey, s1));
  const flipped = Buffer.from(m); flipped[0] = (flipped[0] ?? 0) ^ 0x01;
  console.log('  verify(bit-flipped):', verify(null, flipped, publicKey, s1));
}

// ---------------------------------------------------------------------------
// ECDSA-P256。
// ---------------------------------------------------------------------------

export function ecdsaDemo(): void {
  console.log('\n=== ECDSA-P256 + SHA-256 ===');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const m = Buffer.from('the message');
  // ECDSA 需要显式指定哈希，因为原始签名并不绑定到某个具体的哈希函数——
  // 验签方需要知道要对消息做怎样的哈希。
  const sig = sign('sha256', m, privateKey);
  const ok  = verify('sha256', m, publicKey, sig);
  console.log('  DER signature length:', sig.length, '(varies 70-72 typically)');
  console.log('  verify(original)   :', ok);
  const flipped = Buffer.from(m); flipped[0] = (flipped[0] ?? 0) ^ 0x01;
  console.log('  verify(bit-flipped):', verify('sha256', flipped, publicKey, sig));

  void randomBytes; void createHash;
}

// ---------------------------------------------------------------------------
// RSA-PSS。
// ---------------------------------------------------------------------------

export function rsaPssDemo(): void {
  console.log('\n=== RSA-PSS (the only safe RSA signature padding) ===');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const skPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const pkPem = publicKey.export({ format: 'pem', type: 'spki' });
  // Node 在 Ed25519/RSA 的 `sign` 中默认使用 PSS，这里显式指定 PSS。
  const sig = sign('sha256', Buffer.from('message'), {
    key: skPem,
    padding: 6, // crypto.constants.RSA_PKCS1_PSS_PADDING
    saltLength: 32,
  });
  const ok = verify('sha256', Buffer.from('message'), {
    key: pkPem,
    padding: 6,
    saltLength: 32,
  }, sig);
  console.log('  sig length:', sig.length, '(==256 for 2048-bit key)');
  console.log('  verify    :', ok);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function execute(): void {
  ed25519Demo();
  ecdsaDemo();
  rsaPssDemo();
}

if (process.argv[1]?.endsWith('signatures.ts')) execute();
