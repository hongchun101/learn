/**
 * 挑战 6 —— CSPRNG（挑战 6 参考实现）。
 *
 * Node 的 `crypto.randomBytes` 包装了操作系统的 CSPRNG（Linux：`getrandom()`，
 * Windows：经由 CNG 的 `BCryptGenRandom`，macOS：`SecRandomCopyBytes`）。
 * 这些均经过审查以满足 NIST SP 800-90A / SP 800-22 的期望。
 *
 * 我们将其暴露为 `Csprng`，以便各语言模块能够匹配同一接口。
 */

import { randomBytes } from 'node:crypto';
import type { Csprng } from './contracts.js';

export const NodeCsprng: Csprng = {
  randomBytes(outLen) {
    if (outLen < 0) throw new Error('outLen must be non-negative');
    if (outLen > 1024 * 1024) throw new Error('outLen unreasonably large; chunk it');
    if (outLen === 0) return new Uint8Array(0);
    return new Uint8Array(randomBytes(outLen));
  },
};
