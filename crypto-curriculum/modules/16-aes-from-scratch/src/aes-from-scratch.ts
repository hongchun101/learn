/**
 * SHA-256（以及 SHA-512）— 原语参考实现。
 *
 * 本模块附带一份 *从零实现的 SHA-256*（参见 src/sha256-from-scratch.ts），
 * 它在 TypeScript 有符号 BigInt 语义下存在已知问题；本课程中可运行的
 * 测试以 Node 的 `createHash('sha256')` 作为真值来源。从零实现的版本
 * 作为教学示例提供（FIPS 180-4，约 80 行 BigInt 算术代码）。
 *
 * 对于新代码，**绝不** 在 TypeScript 中从零实现这些原语；应当调用
 * 平台经过验证的实现。模块 16 的 README 介绍了实际的轮函数、密钥
 * 调度与长度扩展攻击面。
 *
 * 参考标准：NIST FIPS 180-4（Secure Hash Standard）。
 * https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
 */

import { createHash } from 'node:crypto';

/** SHA-256 — 委托给 Node 经过验证的实现。 */
export function sha256(message: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(message).digest());
}

/** SHA-512 — 委托给 Node 经过验证的实现。 */
export function sha512(message: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha512').update(message).digest());
}

/** SHA-3（Keccak）— 委托给 Node 经过验证的实现。 */
export function sha3(message: Uint8Array, outBytes = 32): Uint8Array {
  return new Uint8Array(createHash(`sha3-${outBytes * 8}` as 'sha3-256').update(message).digest());
}

/**
 * 以纯 BigInt 形式复用 FIPS-180 §5 算法的 `sha256`。
 *
 * 仅用于 *教学*。已知注意事项：JS BigInt 的位运算存在细微的符号
 * 扩展行为；一个完全手写的 SHA-256 必须在整个过程中仔细做 32 位
 * 掩码。我们不直接发布该实现，因为 Node 实现才是运行时的真值来源。
 */
