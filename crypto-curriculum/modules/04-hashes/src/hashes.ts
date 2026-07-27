/**
 * 模块 04 —— 哈希函数与长度扩展属性。
 *
 * 三个示例脚本：
 *   1. SHA-256 对空输入的哈希——标准结果。
 *   2. 长度扩展：给定 SHA-256(M) 与 |M|，攻击者可以在不知 M 的情况下
 *      计算 SHA-256(M ‖ padding ‖ X)。（仅作演示。）
 *   3. HMAC 与 SHA-256 对 (k, m) 的结果——展示 HMAC 不可被长度扩展
 *      （这也正是它在 MAC 中被采用的原因）。
 */

import { createHash, createHmac } from 'node:crypto';

function sha256(data: Buffer): Buffer { return createHash('sha256').update(data).digest(); }

// ---------------------------------------------------------------------------
// 1. 标准哈希输出。
// ---------------------------------------------------------------------------

export function canonicalHashes(): void {
  console.log('\n=== Canonical SHA-256 outputs ===');
  console.log('  SHA-256("")       =', sha256(Buffer.alloc(0)).toString('hex'));
  console.log('  SHA-256("abc")    =', sha256(Buffer.from('abc')).toString('hex'));
  console.log('  SHA-256("hello")  =', sha256(Buffer.from('hello')).toString('hex'));
}

// ---------------------------------------------------------------------------
// 2. 长度扩展示范。
// ---------------------------------------------------------------------------

/**
 * SHA-256 内部 Merkle–Damgård 状态：256 位的中间值。处理完 N 个块后，
 * 该状态即为压缩函数的下一输入；因此，给定 (state, length)，就可以再扩
 * 展一个块。
 *
 * 对于真实的攻击模型，这一特性只对 hash(M ‖ key) 这类 MAC 形式有利，
 * 永远不会影响 HMAC。
 */
function mdPadding(messageLenBytes: number): Buffer {
  const bitLen = BigInt(messageLenBytes) * 8n;
  const padLen = (((messageLenBytes + 9 + 63) >> 6) << 6) - messageLenBytes;
  const pad = Buffer.alloc(padLen);
  pad[0] = 0x80;
  pad.writeBigUInt64BE(bitLen, pad.length - 8);
  return pad;
}

export function lengthExtensionDemo(): void {
  console.log('\n=== Length-extension (illustrative) ===');
  // 攻击者拥有 H(M) 与 |M|，但并不知道 M（例如 M 是 JWT 的秘密 Cookie）。
  // 他们选择一个扩展 X 并尝试请求 H(M ‖ pad ‖ X)。
  const M = Buffer.from('this is a secret value');
  const X = Buffer.from('&admin=true');
  const H = sha256(M);
  const pad = mdPadding(M.length);
  // “朴素 MAC”形式：H(M)。攻击者通过把 H 本身当作中间状态再次使用来
  // 计算 H(M ‖ pad ‖ X)——下面是展示这种结构的*模拟*，并非真实伪造算法。
  const inner = sha256(Buffer.concat([M, pad]));
  const outer = sha256(Buffer.concat([inner, X]));
  console.log('  H(M)                                 =', H.toString('hex').slice(0, 16) + '…');
  console.log('  H(M ‖ pad(M) ‖ X)  [computed as H()] =', sha256(Buffer.concat([M, pad, X])).toString('hex').slice(0, 16) + '…');
  console.log('  (Note: H(H(M) ‖ X) by no special library support ===');
  console.log('   H(M ‖ pad ‖ X) unless you can initialise a SHA-256 ctx');
  console.log('   with state = H(M); most languages expose this via `update + init_state`.');
  // HMAC 即为修复方案。
  void outer;
}

// ---------------------------------------------------------------------------
// 3. HMAC 健全性：相同 key+message → 相同 tag；不同 key/msg → 不同 tag。
// ---------------------------------------------------------------------------

export function hmacDemo(): void {
  console.log('\n=== HMAC-SHA-256 sanity ===');
  const k = Buffer.from('secret');
  const m = Buffer.from('hello world');
  const t1 = createHmac('sha256', k).update(m).digest();
  const t2 = createHmac('sha256', k).update(m).digest();
  const t3 = createHmac('sha256', Buffer.from('sEcReT')).update(m).digest();
  const t4 = createHmac('sha256', k).update(Buffer.from('hello wOrld')).digest();
  console.log('  HMAC(k, m)      == HMAC(k, m)         :', t1.equals(t2));
  console.log('  HMAC(k, m)      != HMAC(k\', m)       :', !t1.equals(t3));
  console.log('  HMAC(k, m)      != HMAC(k, m\')       :', !t1.equals(t4));
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function execute(): void {
  canonicalHashes();
  lengthExtensionDemo();
  hmacDemo();
}

if (process.argv[1]?.endsWith('hashes.ts')) execute();
