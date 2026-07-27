/**
 * 挑战 2 —— HMAC-SHA-256（挑战 2 参考实现）。
 *
 * `crypto.createHmac('sha256', key)` 实现的是 RFC 2104 中的 HMAC。
 * 对于 SHA-256，标签长度固定为 32 字节。我们同时暴露 `sign` 与 `verify`，
 * 其中 `verify` 使用 `crypto.timingSafeEqual` 进行常数时间比较。
 *
 * 为什么要常数时间：在标签上使用非常数时间的 `==` 会通过时延泄漏首个
 * 差异字节的位置。远程攻击者已经在实际中通过这种方式逐字节地恢复
 * 了面向网络的 HMAC 标签。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Mac } from './contracts.js';

export const HmacSha256: Mac = {
  tagLength: 32,

  sign(key, message) {
    const mac = createHmac('sha256', Buffer.from(key));
    mac.update(Buffer.from(message));
    return new Uint8Array(mac.digest());
  },

  verify(key, message, tag) {
    const expected = this.sign(key, message);
    if (expected.length !== tag.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(tag));
  },
};
