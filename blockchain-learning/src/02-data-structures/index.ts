// =============================================================================
// Chapter 02 — Hash-based Data Structures index
// =============================================================================

export {
  merkleLeafHash,
  merkleNodeHash,
  buildMerkleTree,
  merkleRoot,
  merkleProof,
  verifyMerkleProof,
  type MerkleProofStep,
} from './merkle.js';
export { Mmr } from './merkle.js';
export { SparseMerkleTree, SMT_EMPTY } from './merkle.js';
export { HexaryPatriciaTrie, type PatriciaNode } from './merkle.js';
export { demo } from './demo.js';

export type Hash = Uint8Array;
