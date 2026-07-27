/**
 * 挑战 3 —— SHA-256（挑战 3 参考实现）。
 *
 * 我们刻意使用 Node 的 `crypto.createHash`，在 Linux 上它由 OpenSSL 支持。
 * 这里不使用"纯 JS"实现的 SHA-256，因为只有 OpenSSL/BoringSSL/CNG
 * 路径才能保证侧信道与性能特性。
 */

import { createHash } from 'node:crypto';
import type { Hash } from './contracts.js';

export const Sha256: Hash = {
  outputLength: 32,

  hash(message) {
    const h = createHash('sha256');
    h.update(Buffer.from(message));
    return new Uint8Array(h.digest());
  },
};
