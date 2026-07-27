/**
 * 模块 18 — 毕业项目：一个简单的带认证的密钥交换协议。
 *
 * "naive"（朴素）版本可被中间人攻击，因为没有任何东西对临时 DH 密钥
 * 进行认证。"signed"（签名）版本则通过 Ed25519 对它们进行加固。
 *
 * 所用原语（每一种都在前面的模块中构建过）：
 *   - X25519 ECDH：每个会话生成一对临时密钥
 *   - HKDF-SHA-256：从 DH 共享秘密派生 AES 密钥
 *   - AES-256-GCM：加密载荷
 *   - Ed25519 签名：用于长期身份的认证
 */

import {
  diffieHellman,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import { HkdfSha256 } from '../../../src/crypto/index.js';

export interface Keypair {
  pk: Uint8Array;       // 32 字节原始 X25519 公钥
}

export interface LongTerm {
  signPk: Uint8Array;  // 32 字节原始 Ed25519 公钥
}

const PROTOCOL_LABEL = Buffer.from('mod18/capstone/v1');

/** 32 字节原始 X25519 公钥对应的 SPKI 头（前缀，12 字节）。
 *  Sequence（44 字节）{ sequence（5 字节）{ OID 1.3.101.110 }, BIT STRING（33 字节）}。 */
const X25519_SPKI_HDR = Buffer.from('302a300506032b656e032100', 'hex');
/** 32 字节原始 Ed25519 公钥对应的 SPKI 头（前缀，12 字节）。
 *  Sequence（44 字节）{ sequence（5 字节）{ OID 1.3.101.112 }, BIT STRING（33 字节）}。 */
const ED25519_SPKI_HDR = Buffer.from('302a300506032b6570032100', 'hex');

export function ephemeralX25519(): Keypair {
  const kp = generateKeyPairSync('x25519');
  const pkRaw = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { sk: kp.privateKey, pk: new Uint8Array(pkRaw) };
}

export function longTermEd25519(): LongTerm {
  const kp = generateKeyPairSync('ed25519');
  const pkRaw = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { signSk: kp.privateKey, signPk: new Uint8Array(pkRaw) };
}

function importX25519Public(raw: Uint8Array): KeyObject {
  return createPublicKey({
    key: Buffer.concat([X25519_SPKI_HDR, Buffer.from(raw)]),
    format: 'der',
    type: 'spki',
  });
}

function importEd25519Public(raw: Uint8Array): KeyObject {
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_HDR, Buffer.from(raw)]),
    format: 'der',
    type: 'spki',
  });
}

/** Diffie-Hellman 共享秘密。 */
export function dhShared(mySk: KeyObject, theirPk: Uint8Array): Uint8Array {
  const pkKo = importX25519Public(theirPk);
  return new Uint8Array(diffieHellman({ privateKey: mySk, publicKey: pkKo }));
}

export function deriveSessionKey(dh: Uint8Array): Uint8Array {
  return HkdfSha256.derive(dh, 32, undefined, PROTOCOL_LABEL);
}

export function aesGcmEncrypt(key: Uint8Array, plaintext: Uint8Array): {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
} {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  const tag = c.getAuthTag();
  return {
    ciphertext: new Uint8Array(ct),
    nonce: new Uint8Array(nonce),
    tag: new Uint8Array(tag),
  };
}

export function aesGcmDecrypt(
  key: Uint8Array,
  env: { ciphertext: Uint8Array; nonce: Uint8Array; tag: Uint8Array },
): Uint8Array {
  const d = createDecipheriv('aes-256-gcm', key, env.nonce);
  d.setAuthTag(env.tag);
  return new Uint8Array(Buffer.concat([d.update(env.ciphertext), d.final()]));
}

export function signEphemeral(sk: KeyObject, ePk: Uint8Array): Uint8Array {
  return new Uint8Array(edSign(null, Buffer.from(ePk), sk));
}

export function verifyEphemeral(
  pk: Uint8Array,
  ePk: Uint8Array,
  sig: Uint8Array,
): boolean {
  try {
    const verifyKo = importEd25519Public(pk);
    return edVerify(null, Buffer.from(ePk), verifyKo, Buffer.from(sig));
  } catch {
    return false;
  }
}
