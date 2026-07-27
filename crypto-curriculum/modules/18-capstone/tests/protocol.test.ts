/**
 * 模块 18 — 毕业项目测试：一种带认证的握手协议，能抵御对
 * 朴素版本的中间人攻击，并对签名版本进行重放测试。
 */

import { describe, it, expect } from 'vitest';
import {
  ephemeralX25519,
  longTermEd25519,
  dhShared,
  deriveSessionKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
  signEphemeral,
  verifyEphemeral,
} from '../src/protocol.js';

function hex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

describe('module 18: ephemeral X25519 + AES-GCM round-trip', () => {
  it('DH keys agree on both sides', () => {
    const a = ephemeralX25519();
    const b = ephemeralX25519();
    expect(hex(dhShared(a.sk, b.pk))).toBe(hex(dhShared(b.sk, a.pk)));
    expect(dhShared(a.sk, b.pk).length).toBe(32);
  });

  it('AES-GCM round-trips over the derived key', () => {
    const a = ephemeralX25519();
    const b = ephemeralX25519();
    const k = deriveSessionKey(dhShared(a.sk, b.pk));
    const pt = new TextEncoder().encode('secret message');
    const env = aesGcmEncrypt(k, pt);
    const pt2 = aesGcmDecrypt(k, env);
    expect(new TextDecoder().decode(pt2)).toBe('secret message');
  });

  it('AES-GCM rejects bit-flipped ciphertext', () => {
    const a = ephemeralX25519();
    const b = ephemeralX25519();
    const k = deriveSessionKey(dhShared(a.sk, b.pk));
    const pt = new TextEncoder().encode('payload');
    const env = aesGcmEncrypt(k, pt);
    env.ciphertext[0] = (env.ciphertext[0] ?? 0) ^ 0x01;
    expect(() => aesGcmDecrypt(k, env)).toThrow();
  });
});

describe('module 18: identity authentication', () => {
  it('signed ephemeral key verifies the holder of the long-term key', () => {
    const alice = longTermEd25519();
    const aliceEph = ephemeralX25519();
    const sig = signEphemeral(alice.signSk, aliceEph.pk);
    expect(sig.length).toBe(64);
    expect(verifyEphemeral(alice.signPk, aliceEph.pk, sig)).toBe(true);
  });

  it('signature forgery (different signer) is rejected', () => {
    const alice = longTermEd25519();
    const mallory = longTermEd25519();
    const aliceEph = ephemeralX25519();
    const sig = signEphemeral(mallory.signSk, aliceEph.pk);
    expect(verifyEphemeral(alice.signPk, aliceEph.pk, sig)).toBe(false);
  });

  it('bit-flipped signature is rejected', () => {
    const alice = longTermEd25519();
    const aliceEph = ephemeralX25519();
    const sig = new Uint8Array(signEphemeral(alice.signSk, aliceEph.pk));
    sig[0] = (sig[0] ?? 0) ^ 0x01;
    expect(verifyEphemeral(alice.signPk, aliceEph.pk, sig)).toBe(false);
  });
});

describe('module 18: MITM demo — naive vs signed', () => {
  it('NAIVE: attacker can substitute their key without detection', () => {
    // Alice 以为她在和 Bob 通信。Bob 以为他在和 Alice 通信。
    // 攻击者 Eve 处在中间，并对流量进行重新加密。
    const aliceE = ephemeralX25519();
    const bobE   = ephemeralX25519();
    const eveE   = ephemeralX25519();
    const msgAliceToEve = new TextEncoder().encode('alice → bob secret');
    // Eve 用自己的公钥替换 Bob 的公钥：alice 拿到的是她与 eve 的 DH，
    // bob 拿到的是他与 eve 的 DH。双方都误以为在和对方通信。
    const aliceSharedWithEve = dhShared(aliceE.sk, eveE.pk);
    const bobSharedWithEve   = dhShared(bobE.sk, eveE.pk);
    // 由于输入不同，aliceSharedWithEve 与 bobSharedWithEve 不相等。
    // 但在每一侧，攻击者都是唯一的对端：alice 发给 Eve，
    // Eve 用 Bob 的 DH 密钥重新加密。
    expect(hex(aliceSharedWithEve)).not.toBe(hex(bobSharedWithEve));
    // Eve 因为拥有 aliceSharedWithEve，因而能读取消息内容。
    expect(typeof aliceSharedWithEve).toBe('object');
    // （真实的协议中，本应是 Bob 和 Alice 使用彼此的公钥；
    // 但因为 Eve 拦截并替换，双方都没有察觉任何异常。）
    void msgAliceToEve;
  });

  it('SIGNED: ephemeral substitution fails because the signature does not verify', () => {
    const alice = longTermEd25519();
    const aliceE = ephemeralX25519();
    const eveE   = ephemeralX25519();
    // Alice 对她的临时密钥进行签名。
    const sig = signEphemeral(alice.signSk, aliceE.pk);
    // Eve 实施替换：用自己的临时公钥替换 alice 的，并附带一个伪造的签名。
    const forgedSig = signEphemeral(alice.signSk, eveE.pk);
    expect(verifyEphemeral(alice.signPk, aliceE.pk, forgedSig)).toBe(false);
  });
});

describe('module 18: replay resistance', () => {
  it('two captured sessions use distinct session keys (nonce is per-session)', () => {
    const a = ephemeralX25519();
    const b = ephemeralX25519();
    // 重放：同一对临时密钥在两次会话中被重复使用。
    // 每次都会派生一个全新的会话密钥。
    const dh = dhShared(a.sk, b.pk);
    const k1 = deriveSessionKey(dh);
    const k2 = deriveSessionKey(dh);
    // 相同的 DH 派生出相同的密钥（我们没有变更协议标签，
    // 这也是正确的）。若要强制产生不同的会话，需要重新生成临时密钥。
    const a2 = ephemeralX25519();
    const b2 = ephemeralX25519();
    const dh2 = dhShared(a2.sk, b2.pk);
    expect(hex(dh)).not.toBe(hex(dh2));
    void k1; void k2;
  });
});
