/**
 * 挑战 1 —— AES-GCM 带认证加密（挑战 1 参考实现）。
 *
 * 使用 Node 内置的 `crypto.createCipheriv('aes-256-gcm', …)`。认证标签与密文
 * 一起通过 `auth_tag` 槽返回。nonce 长度按 RFC 5116 为 96 位（12 字节）。
 *
 * 失败模型：如果标签校验不通过，GCM 在 `final()` 时返回 null。我们将其
 * 转换为抛出异常，让调用方可以捕获认证失败而无需检查布尔值。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AuthenticatedCipher } from './contracts.js';

export const AesGcm: AuthenticatedCipher = {
  encrypt(key, plaintext, aad) {
    if (key.length !== 32) throw new Error('AES-256-GCM needs 32-byte key');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    if (aad && aad.length > 0) cipher.setAAD(aad);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: new Uint8Array(ct), nonce, tag };
  },

  decrypt(key, ciphertext, nonce, tag, aad) {
    if (key.length !== 32) throw new Error('AES-256-GCM needs 32-byte key');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    if (aad && aad.length > 0) decipher.setAAD(aad);
    // final() 在认证标签不匹配时返回 null —— 我们改为抛出异常。
    const pt = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return new Uint8Array(pt);
  },
};
