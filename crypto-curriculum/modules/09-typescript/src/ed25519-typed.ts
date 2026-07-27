/**
 * 模块 09 —— TypeScript 契约接口面。
 *
 * 为 Ed25519 密钥定义*品牌化（branded）*类型，使类型系统能防止
 * 最常见的“踩坑”：在期望公钥的地方传入了私钥种子（或反之）。
 * 二者都是 32 字节的 Uint8Array；没有品牌化时它们可以互换。
 */

declare const PRIVATE_KEY_BRAND: unique symbol;
declare const PUBLIC_KEY_BRAND: unique symbol;

export type Ed25519PrivateSeed = Uint8Array & { readonly [PRIVATE_KEY_BRAND]: true };
export type Ed25519PublicPoint = Uint8Array & { readonly [PUBLIC_KEY_BRAND]: true };

/**
 * 从任意 32 字节数组铸造 PrivateSeed。
 * 若输入不是恰好 32 字节则抛出异常（这是真正的运行时安全，
 * 而非仅类型系统层面的检查）。
 */
export function asPrivateSeed(b: Uint8Array): Ed25519PrivateSeed {
  if (b.length !== 32) throw new Error('Ed25519 seed must be 32 bytes');
  return b as Ed25519PrivateSeed;
}

export function asPublicPoint(b: Uint8Array): Ed25519PublicPoint {
  if (b.length !== 32) throw new Error('Ed25519 point must be 32 bytes');
  return b as Ed25519PublicPoint;
}

/**
 * 签名与验签操作现在在边界处具有类型安全保证。
 * @comptime 该函数在编译期得到保证：不能传入错误品牌的参数。
 */
export interface TypedSignatureScheme {
  sign(sk: Ed25519PrivateSeed, message: Uint8Array): Uint8Array;
  verify(pk: Ed25519PublicPoint, message: Uint8Array, signature: Uint8Array): boolean;
}

export function useEd25519(s: TypedSignatureScheme): TypedSignatureScheme {
  return s;
}
