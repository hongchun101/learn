import {
  merkleRoot,
  merkleProof,
  verifyMerkleProof,
  Mmr,
  SMT_EMPTY,
} from './merkle.js';

export interface Chapter02DemoResult {
  binaryMerkleRoot: string;
  binaryMerkleProofSize: number;
  binaryVerified: boolean;
  mmrRoot: string;
  mmrPeaks: number[];
  mmrNodeCount: number;
  smtEmptyRoot: string;
}

export function demo(): Chapter02DemoResult {
  const data = [
    new TextEncoder().encode('tx-1'),
    new TextEncoder().encode('tx-2'),
    new TextEncoder().encode('tx-3'),
    new TextEncoder().encode('tx-4'),
    new TextEncoder().encode('tx-5'),
  ];

  const root = merkleRoot(data);
  const proof = merkleProof(data, 2);
  const verified = verifyMerkleProof(data[2]!, root, proof);

  const mmr = new Mmr();
  for (let i = 0; i < 7; i++) mmr.append(new TextEncoder().encode(`event-${i}`));
  const mmrRoot = mmr.root();
  const mmrPeaks = mmr.peaksAt();
  const mmrNodes = mmr.size();

  return {
    binaryMerkleRoot: hex(root),
    binaryMerkleProofSize: proof.length,
    binaryVerified: verified,
    mmrRoot: hex(mmrRoot),
    mmrPeaks,
    mmrNodeCount: mmrNodes,
    smtEmptyRoot: hex(SMT_EMPTY),
  };
}

function hex(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) {
    out += (b[i] ?? 0).toString(16).padStart(2, '0');
  }
  return out;
}
