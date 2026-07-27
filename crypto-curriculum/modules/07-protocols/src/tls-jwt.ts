/**
 * 模块 07 —— 协议：TLS、JWT、秘密共享。
 *
 * 演示：
 *   1. 向 www.example.com:443 发起真实的 TLS 1.3 连接。
 *   2. 基于 HMAC 的 JWT，并使用算法白名单（algorithm pinning）。
 *   3. 在 GF(256) 上的 Shamir 秘密共享。
 */

import { connect as tlsConnect, type PeerCertificate, type TLSSocket } from 'node:tls';
import { createHmac, randomBytes } from 'node:crypto';

/** TLSSocket 在 Node 24 中有 getCipher() / getProtocol() / getPeerCertificate()；
 *  公开类型在某些平台上只暴露其中一部分。这里声明我们实际使用的接口面；
 *  在一处集中做类型转换，并附上原因。 */
interface TlsInternals {
  getCipher?: () => { name: string; version: string };
  getProtocol?: () => string | null;
}

// ---------------------------------------------------------------------------
// 1. TLS 检查。
// ---------------------------------------------------------------------------

export async function tlsInspect(host = 'www.example.com', port = 443): Promise<void> {
  console.log(`\n=== TLS 1.3 inspection of ${host}:${port} ===`);
  const sock: TLSSocket = tlsConnect({
    host, port, servername: host,
    ALPNProtocols: ['http/1.1'],
  });
  await new Promise<void>((resolve, reject) => {
    sock.once('secureConnect', () => resolve());
    sock.once('error', reject);
    sock.once('timeout', () => reject(new Error('tls timeout')));
    setTimeout(() => sock.end(), 5000);
  });
  const internals = sock as unknown as TlsInternals;
  const cipher = internals.getCipher?.();
  const proto  = internals.getProtocol?.();
  console.log('  protocol       :', proto);   // 例如 'TLSv1.3'
  console.log('  cipher name    :', cipher?.name); // 例如 'TLS_AES_128_GCM_SHA256'
  console.log('  cipher version :', cipher?.version);

  const leaf: PeerCertificate = sock.getPeerCertificate();
  const subjectEntries = leaf.subject
    ? Object.entries(leaf.subject).map(([k, v]) => `${k}=${v}`).join(',')
    : '';
  const issuerEntries = leaf.issuer
    ? Object.entries(leaf.issuer).map(([k, v]) => `${k}=${v}`).join(',')
    : '';
  console.log('  leaf subject   :', subjectEntries);
  console.log('  leaf issuer    :', issuerEntries);
  console.log('  alt names      :', (leaf.subjectaltname ?? '').slice(0, 60));
  sock.end();
}

// ---------------------------------------------------------------------------
// 2. JWT（HS256），使用算法白名单。
// ---------------------------------------------------------------------------

function b64uEncode(b: Buffer): string {
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64uDecode(s: string): Buffer {
  return Buffer.from(
    s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length & 3)) & 3),
    'base64',
  );
}

interface JwtHeader { alg: string; typ?: string }
interface JwtPayload { [key: string]: unknown }

function jwtSignHS256(payload: JwtPayload, key: Buffer): string {
  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const h = b64uEncode(Buffer.from(JSON.stringify(header)));
  const p = b64uEncode(Buffer.from(JSON.stringify(payload)));
  const msg = Buffer.from(`${h}.${p}`);
  const s = b64uEncode(createHmac('sha256', key).update(msg).digest());
  return `${h}.${p}.${s}`;
}

function jwtVerifyAllowList(
  token: string,
  key: Buffer,
  allowed: Set<string>,
): { ok: boolean; payload?: JwtPayload } {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false };
  const [h, p, s] = parts as [string, string, string];
  const header = JSON.parse(b64uDecode(h).toString()) as JwtHeader;
  if (!allowed.has(header.alg)) return { ok: false };
  const expected = b64uEncode(createHmac('sha256', key).update(Buffer.from(`${h}.${p}`)).digest());
  if (expected !== s) return { ok: false };
  return { ok: true, payload: JSON.parse(b64uDecode(p).toString()) as JwtPayload };
}

export function jwtAllowListDemo(): void {
  console.log('\n=== JWT verify with algorithm allow-list ===');
  const key = randomBytes(32);
  const tok = jwtSignHS256({ sub: 'alice', role: 'admin' }, key);
  console.log('  token (truncated):', tok.slice(0, 48) + '…');

  console.log('  allow-list HS256:', jwtVerifyAllowList(tok, key, new Set(['HS256'])).ok);
  console.log('  allow-list RS256:', jwtVerifyAllowList(tok, key, new Set(['RS256'])).ok);

  // 伪造 `alg: none`（无签名）—— 应始终被拒绝。
  const payloadB64 = tok.split('.')[1] ?? '';
  const forged = `${b64uEncode(Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })))}.${payloadB64}.`;
  console.log('  alg:none rejected:', !jwtVerifyAllowList(forged, key, new Set(['HS256'])).ok);
}

// ---------------------------------------------------------------------------
// 3. 在 GF(256) 上的 Shamir 秘密共享。
// ---------------------------------------------------------------------------

function gfAdd(a: number, b: number): number { return a ^ b; }
function gfMul(a: number, b: number): number {
  let r = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) r ^= a;
    const carry = a & 0x80;
    a = (a << 1) & 0xff;
    if (carry) a ^= 0x1b;
    b >>= 1;
  }
  return r & 0xff;
}
function gfInv(a: number): number {
  if (a === 0) throw new Error('no inverse of 0');
  for (let b = 1; b < 256; b++) if (gfMul(a, b) === 1) return b;
  throw new Error('not found');
}

export function makeShares(secret: Buffer, k: number, n: number): Buffer[] {
  if (k > n) throw new Error('k must be ≤ n');
  const coeffs: number[][] = Array.from({ length: k }, () =>
    Array.from({ length: secret.length }, () => Math.floor(Math.random() * 256)));
  coeffs[0] = Array.from(secret);
  const shares: Buffer[] = [];
  for (let x = 1; x <= n; x++) {
    const y = new Array<number>(secret.length).fill(0);
    for (let j = 0; j < secret.length; j++) {
      let acc = 0;
      for (let i = k - 1; i >= 0; i--) {
        acc = gfAdd(gfMul(acc, x), coeffs[i]![j]!);
      }
      y[j] = acc;
    }
    shares.push(Buffer.from(y));
  }
  return shares;
}

export function reconstruct(shares: Array<{ x: number; y: Buffer }>, k: number): Buffer {
  const len = shares[0]!.y.length;
  const out = Buffer.alloc(len);
  for (let j = 0; j < len; j++) {
    let val = 0;
    for (let i = 0; i < k; i++) {
      let num = 1, den = 1;
      for (let m = 0; m < k; m++) {
        if (i === m) continue;
        const xi = shares[i]!.x, xm = shares[m]!.x;
        num = gfMul(num, xm);
        den = gfMul(den, gfAdd(xi, xm));
      }
      const lagrange = gfMul(num, gfInv(den));
      val = gfAdd(val, gfMul(lagrange, shares[i]!.y[j]!));
    }
    out[j] = val;
  }
  return out;
}

export function shamirDemo(): void {
  console.log('\n=== Shamir Secret Sharing (k=3, n=5) ===');
  const secret = Buffer.from('a secret of 22 bytes! ');
  const k = 3, n = 5;
  const shares = makeShares(secret, k, n);
  const labelled = shares.map((y, i) => ({ x: i + 1, y }));
  const r = reconstruct([labelled[0]!, labelled[2]!, labelled[4]!], k);
  console.log('  secret          :', secret.toString());
  console.log('  reconstructed   :', r.toString());
  console.log('  equal           :', r.equals(secret));
}

// ---------------------------------------------------------------------------
// 驱动入口。
// ---------------------------------------------------------------------------

export async function execute(): Promise<void> {
  await tlsInspect();
  jwtAllowListDemo();
  shamirDemo();
}

if (process.argv[1]?.endsWith('tls-jwt.ts')) {
  execute().catch((e) => { console.error(e); process.exit(1); });
}
