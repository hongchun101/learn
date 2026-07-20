/**
 * Module 09 — TypeScript contract surface.
 *
 * Defines *branded* types for Ed25519 keys so the type system prevents the
 * most common foot-gun: passing a private-key seed where a public key is
 * expected (or vice versa). Both are 32-byte Uint8Array; without branding
 * they are interchangeable.
 */

declare const PRIVATE_KEY_BRAND: unique symbol;
declare const PUBLIC_KEY_BRAND: unique symbol;

export type Ed25519PrivateSeed = Uint8Array & { readonly [PRIVATE_KEY_BRAND]: true };
export type Ed25519PublicPoint = Uint8Array & { readonly [PUBLIC_KEY_BRAND]: true };

/**
 * Mint a PrivateSeed from any 32-byte array.
 * Throws if the input is not exactly 32 bytes (a real safety, not a typesystem one).
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
 * Sign-and-verify operations are now type-safe at the boundary.
 * @comptime This compile-time-evidenced function cannot be called with
 *   arguments of the wrong brand.
 */
export interface TypedSignatureScheme {
  sign(sk: Ed25519PrivateSeed, message: Uint8Array): Uint8Array;
  verify(pk: Ed25519PublicPoint, message: Uint8Array, signature: Uint8Array): boolean;
}

export function useEd25519(s: TypedSignatureScheme): TypedSignatureScheme {
  return s;
}
