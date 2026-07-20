// Chapter 01 — Hashes used by chains.
//
// Each chain picks its own hash function based on security model and ASIC
// economics:
//   * SHA-256 (BTC mining, every block/transaction hash in BTC) is the most
//     studied and fastest in hardware. Bitcoin double-hashes it for some uses
//     to mitigate length-extension attacks on its Merkle–Damgård construction.
//   * Keccak-256 (Ethereum, "SHA3-256 without NIST padding") is a sponge with
//     natural length-extension resistance.
//   * RIPEMD-160 + SHA-256 compose to the 160-bit "Hash160" used for BTC
//     addresses.
//   * BLAKE2b is faster than SHA-256 in software and used by Zcash, Polkadot,
//     Filecoin, NEAR, Solana.
//
// References:
//   - FIPS 180-4 (SHA-256): https://nvlpubs.nist.gov/nistpubs/FIPS/180-4.pdf
//   - Keccak spec: https://keccak.team/files/Keccak-submission-3.pdf
//   - RIPEMD-160: https://homes.esat.kuleuven.be/~bosselae/ripemd160.html
//   - BLAKE2 spec: https://www.blake2.net/blake2.pdf

import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { keccak_256 as nobleKeccak } from '@noble/hashes/sha3';
import { ripemd160 as nobleRipemd160 } from '@noble/hashes/ripemd160';
import { blake2b as nobleBlake2b } from '@noble/hashes/blake2b';

export { nobleSha256 as sha256, nobleKeccak as keccak256, nobleRipemd160 as ripemd160 };

/** Double SHA-256 — Bitcoin's protocol-level hash for blocks and txids. */
export function sha256d(data: Uint8Array): Uint8Array {
  return nobleSha256(nobleSha256(data));
}

/** Hash160 = RIPEMD-160(SHA-256(x)). Standard BTC address derivation. */
export function hash160(data: Uint8Array): Uint8Array {
  return nobleRipemd160(nobleSha256(data));
}

/** BLAKE2b with 32-byte output (e.g. Zcash, Polkadot). */
export function blake2b256(data: Uint8Array, key?: Uint8Array): Uint8Array {
  return nobleBlake2b(data, { dkLen: 32, ...(key ? { key } : {}) });
}

/** BLAKE2b with explicit output length (Zcash uses 50, others vary). */
export function blake2b(data: Uint8Array, outputLength: number, key?: Uint8Array): Uint8Array {
  return nobleBlake2b(data, { dkLen: outputLength, ...(key ? { key } : {}) });
}
