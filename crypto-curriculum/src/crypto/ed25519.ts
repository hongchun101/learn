/**
 * 挑战 5 —— Ed25519 签名（挑战 5 参考实现）。
 *
 * 使用 Node 内置的 `crypto.sign` / `verify` 并指定 `ed25519`。
 * Node 24 将其委派给 OpenSSL/BoringSSL，它们使用 djb/Irdeto Ed25519
 * 的参考常数时间实现。
 *
 * 设计决策：跨模块契约返回原始的 32 字节种子（对应私钥）以及 32 字节
 * 压缩点（对应公钥）。Node 端负责把这些原始字节包进相应的 RFC 8410
 * DER 头中，从而可以通过 `KeyObject` 来回传递。
 *
 * 验签算法（RFC 8032 §5.1.7，概要）：
 *   解码  sig = (R, S)
 *   解码  A   = pk
 *   h          = SHA-512(R || A || M) mod L
 *   2^c * S * B = 2^c * R + 2^c * h * A    （协因子版本验签）
 *
 * Node 已代为完成这些计算；我们只负责字节翻译。
 */

import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import type { SignaturePair } from './contracts.js';

interface EdKeypairFull {
  skSeed: Uint8Array;        // 32 字节原始种子
  pkPoint: Uint8Array;       // 32 字节压缩点
  skObject: KeyObject;
  pkObject: KeyObject;
}

/**
 * Ed25519 32 字节原始种子的 PKCS#8 DER 头（RFC 8410 §7，共 16 字节）。
 *   30 2e           序列（46 字节）
 *   02 01 00        整数 0（版本）
 *   30 05 06 03 2b 65 70   对象标识符 1.3.101.112（id-Ed25519）
 *   04 22 04 20     八位字节串（34 字节，包装后的密钥）
 *
 * 实测：Node 序列化新生成的 Ed25519 密钥对时正好使用此前缀。
 */
const ED25519_PKCS8_HEADER = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Ed25519 32 字节压缩公钥点的 SPKI DER 头（12 字节）。
 *   30 2a           序列（42 字节）
 *   30 05 06 03 2b 65 70   对象标识符 1.3.101.112（id-Ed25519）
 *   03 21 00        比特串（33 字节，0 个未使用位）
 */
const ED25519_SPKI_HEADER  = Buffer.from('302a300506032b6570032100', 'hex');

export function ed25519Sign(sk: KeyObject, message: Uint8Array): Uint8Array {
  return new Uint8Array(sign(null, Buffer.from(message), sk));
}

export function ed25519Verify(pk: KeyObject, message: Uint8Array, signature: Uint8Array): boolean {
  return verify(null, Buffer.from(message), pk, Buffer.from(signature));
}

/** 同时生成原始字节形式与 KeyObject 形式的密钥对（测试使用）。 */
export function generateEd25519Keypair(): EdKeypairFull {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const skDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const pkDer = publicKey.export({ format: 'der', type: 'spki' });
  return {
    skSeed:  new Uint8Array(skDer.subarray(skDer.length - 32)),
    pkPoint: new Uint8Array(pkDer.subarray(pkDer.length - 32)),
    skObject: privateKey,
    pkObject: publicKey,
  };
}

function importRawSkAsKeyObject(skSeed: Uint8Array): KeyObject {
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_HEADER, Buffer.from(skSeed)]),
    format: 'der',
    type: 'pkcs8',
  });
}

function importRawPkAsKeyObject(pkPoint: Uint8Array): KeyObject {
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_HEADER, Buffer.from(pkPoint)]),
    format: 'der',
    type: 'spki',
  });
}

/** 绑定到 32 字节原始 Ed25519 数据的跨模块 `SignaturePair` 契约。 */
export const Ed25519: SignaturePair = {
  generateKeypair() {
    const { skSeed, pkPoint } = generateEd25519Keypair();
    return { sk: skSeed, pk: pkPoint };
  },

  sign(skSeed, message) {
    return ed25519Sign(importRawSkAsKeyObject(skSeed), message);
  },

  verify(pkPoint, message, signature) {
    try {
      return ed25519Verify(importRawPkAsKeyObject(pkPoint), message, signature);
    } catch {
      return false;
    }
  },
};
