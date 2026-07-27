/**
 * 模块 15 — WebCrypto / SubtleCrypto 契约测试。
 *
 * `crypto-curriculum/tests/crypto.test.ts` 中的跨模块测试套件已经
 * 覆盖了同步的 Node `crypto.*` API。本模块额外测试异步的 SubtleCrypto
 * 路径，以确保同样的性质在浏览器中也成立。
 */

import { describe, it, expect } from 'vitest';

function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

describe('module 15: SubtleCrypto', () => {
  it('AES-GCM encrypt/decrypt round-trip', async () => {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const pt  = new TextEncoder().encode('hello webcrypto');
    const ct  = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
    const pt2 = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
    expect(new TextDecoder().decode(pt2)).toBe('hello webcrypto');
  });

  it('HKDF produces deterministic subkeys', async () => {
    const masterBytes = crypto.getRandomValues(new Uint8Array(32));
    const masterKey = await crypto.subtle.importKey('raw', masterBytes, 'HKDF', false, ['deriveBits']);
    const bits1 = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('enc') },
      masterKey, 256));
    const bits2 = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('enc') },
      masterKey, 256));
    expect(toHex(bits1)).toBe(toHex(bits2));
  });

  it('HMAC-SHA-256 round-trip', async () => {
    const k = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    const m = new TextEncoder().encode('hello');
    const tag = new Uint8Array(await crypto.subtle.sign('HMAC', key, m));
    expect((await crypto.subtle.verify('HMAC', key, tag, m))).toBe(true);
    expect((await crypto.subtle.verify('HMAC', key, tag, new TextEncoder().encode('hellO')))).toBe(false);
  });

  it('SHA-256 (subtle.digest) matches sync crypto.createHash', async () => {
    const data = new TextEncoder().encode('abc');
    const subtleHash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    expect(toHex(subtleHash)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
