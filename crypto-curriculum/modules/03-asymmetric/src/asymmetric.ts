/**
 * 模块 03 —— Node 24 中的非对称原语。
 *
 * 三个示例：
 *   1. RSA-OAEP——唯一值得上线的 RSA 加密模式。
 *   2. X25519 ECDH——密钥交换的现代默认选择。
 *   3. Ed25519 签名与验签——签名的现代默认选择。
 *
 * Bleichenbauch 风格的原始 PKCS#1 v1.5 签名伪造在 README 中以概念
 * 形式给出；要复现真实攻击需要服务端存在格式错误的 PKCS#1 校验器，
 * 故此处仅以文档描述，不做真实演示。
 */

import {
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  diffieHellman,
  sign,
  verify,
  createPrivateKey,
} from 'node:crypto';

// ---------------------------------------------------------------------------
// 1. RSA-OAEP——安全默认值。
// ---------------------------------------------------------------------------

export function rsaOaepDemo(): void {
  console.log('\n=== RSA-OAEP ===');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const skPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const pkPem = publicKey.export({ format: 'pem', type: 'spki' });

  const plaintext = Buffer.from('a top secret message');
  const c1 = publicEncrypt(pkPem, plaintext);
  const c2 = publicEncrypt(pkPem, plaintext);
  console.log('  same plaintext → different ciphertexts:', !c1.equals(c2));
  const r1 = privateDecrypt(skPem, c1);
  console.log('  decrypts back to plaintext          :', r1.toString() === plaintext.toString());

  void publicKey; void privateKey;
}

// ---------------------------------------------------------------------------
// 2. X25519 ECDH。
// ---------------------------------------------------------------------------

export function x25519Demo(): void {
  console.log('\n=== X25519 ECDH ===');
  const a = generateKeyPairSync('x25519');
  const b = generateKeyPairSync('x25519');
  const sharedA = diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey });
  const sharedB = diffieHellman({ privateKey: b.privateKey, publicKey: a.publicKey });
  console.log('  shared length      :', sharedA.length, 'bytes');
  console.log('  both parties match :', Buffer.compare(sharedA, sharedB) === 0);
  console.log('  hex of shared secret (32 chars):', sharedA.toString('hex').slice(0, 32) + '…');
}

// ---------------------------------------------------------------------------
// 3. Ed25519 签名。
// ---------------------------------------------------------------------------

export function ed25519Demo(): void {
  console.log('\n=== Ed25519 sign/verify ===');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const message = Buffer.from('a signed message');
  const sig = sign(null, message, privateKey);
  const ok = verify(null, message, publicKey, sig);
  console.log('  sig length:', sig.length, '(==64 for Ed25519)');
  console.log('  verify(original) :', ok);

  const flipped = Buffer.from(message);
  flipped[0] = (flipped[0] ?? 0) ^ 0x01;
  const ok2 = verify(null, flipped, publicKey, sig);
  console.log('  verify(bit-flipped) :', ok2);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function execute(): void {
  rsaOaepDemo();
  x25519Demo();
  ed25519Demo();
}

// 抑制未使用导入——`createPrivateKey` 是供传入原始字节的调用方使用的。
void createPrivateKey;

if (process.argv[1]?.endsWith('asymmetric.ts')) execute();
