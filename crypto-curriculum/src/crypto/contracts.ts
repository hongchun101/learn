/**
 * 跨章契约接口（TypeScript 参考实现）。
 *
 * 本课程中的每个语言模块都基于这套接口实现相同的六项挑战。
 * `crypto-curriculum/tests/crypto.test.ts` 中的测试用例验证 TypeScript 参考
 * 实现；每个模块自带的测试文件在各自语言里验证同样的属性。
 *
 * 为什么要六项？它们直接对应 `docs/00-taxonomy.md` §6 中的六项跨章挑战——
 * 这是一组用来区分"我实现了 AES"与"我正确实现了 AES"的属性集合。
 *
 * 同步设计：所有参考实现都是同步的。原生使用 async/await 的语言模块
 * （Rust Tokio、JS Workers、Go goroutines）按同一方式包装——同步 API
 * 供异步调用方使用。
 *
 * 所有输入/输出均为 `Uint8Array`；不允许用 string，也不允许只用 `Buffer`。
 * Python/Go/Rust 的模块作者必须在边界处自行转换。
 */

/** 挑战 1 —— 使用带认证加密进行加解密往返。 */
export interface AuthenticatedCipher {
  /** 32 字节密钥（AES-256）。 */
  encrypt(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): {
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    tag: Uint8Array;
  };
  /** `encrypt` 的逆运算。标签不匹配时抛出异常。 */
  decrypt(
    key: Uint8Array,
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    tag: Uint8Array,
    aad?: Uint8Array,
  ): Uint8Array;
}

/** 挑战 2 —— MAC 往返。 */
export interface Mac {
  /** 返回 `tagLength` 字节的标签。 */
  sign(key: Uint8Array, message: Uint8Array): Uint8Array;
  /** 常数时间比较。 */
  verify(key: Uint8Array, message: Uint8Array, tag: Uint8Array): boolean;
  tagLength: number;
}

/** 挑战 3 —— 具备实际碰撞测试的哈希函数。 */
export interface Hash {
  /** 输出长度（字节）。 */
  outputLength: number;
  hash(message: Uint8Array): Uint8Array;
}

/** 挑战 4 —— 带域名分隔的密钥派生函数。 */
export interface Kdf {
  /** 根据 `master` 和可选的 `salt` / `info` 派生 `outLen` 字节的子密钥。 */
  derive(
    master: Uint8Array,
    outLen: number,
    opts?: { salt?: Uint8Array; info?: Uint8Array },
  ): Uint8Array;
}

/** 挑战 5 —— 非对称签名对。 */
export interface SignaturePair {
  /** 生成全新密钥对；用于属性测试，非生产用途。 */
  generateKeypair(): { sk: Uint8Array; pk: Uint8Array };
  sign(sk: Uint8Array, message: Uint8Array): Uint8Array;
  verify(pk: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
}

/** 挑战 6 —— CSPRNG。 */
export interface Csprng {
  /** 生成 `outLen` 字节的密码学安全随机数。 */
  randomBytes(outLen: number): Uint8Array;
}

/** 工具函数：字节相等（常数时间，避免实现侧信息泄漏）。 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** 工具函数：十六进制编码（用于测试输出和 `print-curriculum.ts`）。 */
export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    s += b.toString(16).padStart(2, '0');
  }
  return s;
}
