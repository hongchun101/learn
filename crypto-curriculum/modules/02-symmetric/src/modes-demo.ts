/**
 * 模块 02 —— 分组模式及其经典陷阱。
 *
 * 以下是教学性质参考实现：
 *   - AES-ECB 泄漏（相同明文块 → 相同密文块）
 *   - AES-CTR nonce 复用 → 可恢复两段明文的异或
 *   - AES-GCM 防比特翻转（正面对照；参见 tests/crypto.test.ts）
 *
 * 我们使用 Node 的 `crypto.createCipheriv('aes-256-ecb' | 'aes-256-ctr' | 'aes-256-gcm', …)`。
 * AES-ECB 只接受 key（无 IV）。CBC 则需要显式提供 16 字节 IV。
 *
 * 为何不在此处演示 padding oracle：实施该攻击需要 *服务器* 主动泄漏
 * 一位信息——教材文字中会描述，但要实际攻击真实服务器会越界，
 * 故此处仅保留文字说明。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function toBuf(b: Uint8Array): Buffer {
  return Buffer.from(b);
}
function printHex(label: string, b: Uint8Array, max = 32): void {
  const s = b.length > max ? toHex(b).slice(0, max * 2) + '…' : toHex(b);
  console.log(`  ${label.padEnd(20)} ${s} (${b.length} B)`);
}
function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

// ---------------------------------------------------------------------------
// ECB 泄漏——加密一段全零块组成的长消息；密文会出现重复块。
// ---------------------------------------------------------------------------

export function ecbLeakDemo(): void {
  console.log('\n=== ECB mode leak ===');
  const key = randomBytes(32);
  const plaintext = new Uint8Array(32); // 32 个零字节——两个 16 字节块。
  const cipher = createCipheriv('aes-256-ecb', key, null);
  const c = Buffer.concat([cipher.update(toBuf(plaintext)), cipher.final()]);
  console.log('  plaintext (64 hex):', toHex(plaintext));
  console.log('  ciphertext (64 hex):', toHex(c));
  console.log('  ECB reveals identical block structure:',
    c.slice(0, 16).equals(c.slice(16, 32)));
}

// ---------------------------------------------------------------------------
// CTR nonce 复用——会泄漏两段明文的异或。
// ---------------------------------------------------------------------------

export function ctrNonceReuseDemo(): void {
  console.log('\n=== CTR nonce reuse ===');
  const key = randomBytes(32);
  const nonce = randomBytes(16); // 故意复用。
  const m1 = new TextEncoder().encode('attack at dawn          ');
  const m2 = new TextEncoder().encode('attack at dusk          ');
  const e1 = createCipheriv('aes-256-ctr', key, nonce);
  const c1 = Buffer.concat([e1.update(toBuf(m1)), e1.final()]);
  const e2 = createCipheriv('aes-256-ctr', key, nonce);
  const c2 = Buffer.concat([e2.update(toBuf(m2)), e2.final()]);
  const recovery = xorBytes(c1, c2);
  console.log('  recovered (m1 ⊕ m2):', new TextDecoder().decode(recovery).replace(/[^\x20-\x7e]/g, '.'));
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.min(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  return out;
}

// ---------------------------------------------------------------------------
// GCM 正面对照——比特翻转会被拒绝。
// ---------------------------------------------------------------------------

export function gcmBitFlipDemo(): void {
  console.log('\n=== AES-GCM bit flip ===');
  const key = randomBytes(32);
  const pt  = new TextEncoder().encode('a very secret string');
  const iv  = randomBytes(12);
  const enc = createCipheriv('aes-256-gcm', key, iv);
  const ct  = Buffer.concat([enc.update(toBuf(pt)), enc.final()]);
  const tag = enc.getAuthTag();

  // 先解密一次——应该成功。
  const dec = createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(tag);
  const pt1 = Buffer.concat([dec.update(ct), dec.final()]);
  printHex('plaintext recovered', new Uint8Array(pt1));

  // 翻转一位。
  const cFlipped = new Uint8Array(ct);
  cFlipped[0] = (cFlipped[0] ?? 0) ^ 0x01;
  try {
    const dec2 = createDecipheriv('aes-256-gcm', key, iv);
    dec2.setAuthTag(tag);
    dec2.update(cFlipped);
    dec2.final();
    console.log('  BIT FLIP UNDETECTED — broken!');
  } catch {
    console.log('  bit flip rejected by authentication (correct)');
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function execute(): void {
  ecbLeakDemo();
  ctrNonceReuseDemo();
  gcmBitFlipDemo();
}

if (process.argv[1]?.endsWith('modes-demo.ts')) execute();
