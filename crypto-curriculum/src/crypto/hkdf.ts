/**
 * 挑战 4 —— HKDF-SHA-256（挑战 4 参考实现）。
 *
 * HKDF = Extract + Expand（RFC 5869）：
 *   PRK  = HMAC(salt, IKM)
 *   OKM  = HMAC(PRK, info || 0x01) || HMAC(PRK, info || 0x02) || …
 *
 * 域名分隔通过 `info` 字段实现；这是从同一主密钥派生多个独立子密钥
 * 的标准做法（例如在 TLS 1.3 中从共享密钥派生 AES 密钥与 MAC 密钥）。
 *
 * `salt` 可以为空；若未提供则使用空字符串（RFC 5869 允许这两种形式；
 * Node 的 `crypto.hkdfSync` 行为略有差异，因此我们自行实现）。
 */

import { createHmac } from 'node:crypto';
import type { Kdf } from './contracts.js';

const HASH_LEN = 32; // SHA-256 的字节长度

export const HkdfSha256: Kdf = {
  derive(master, outLen, opts = {}) {
    const salt = opts.salt ?? new Uint8Array(0);
    const info = opts.info ?? new Uint8Array(0);
    if (outLen <= 0) throw new Error('outLen must be positive');
    if (outLen > 255 * HASH_LEN) throw new Error('outLen too large for HKDF-SHA-256');

    // 抽取：PRK = HMAC(salt, IKM)
    const prk = createHmac('sha256', Buffer.from(salt))
      .update(Buffer.from(master))
      .digest();

    // 扩展：链式拼接 HMAC 输出，填满 outLen 字节。
    const out = Buffer.alloc(outLen);
    let prev: Buffer = Buffer.alloc(0);
    let pos = 0;
    for (let counter = 1; pos < outLen; counter++) {
      if (counter > 255) throw new Error('HKDF-SHA-256 overflow');
      const h = createHmac('sha256', prk);
      h.update(prev);
      h.update(Buffer.from(info));
      h.update(Buffer.from([counter]));
      prev = h.digest();
      const toCopy = Math.min(prev.length, outLen - pos);
      prev.copy(out, pos, 0, toCopy);
      pos += toCopy;
    }
    return new Uint8Array(out);
  },
};
