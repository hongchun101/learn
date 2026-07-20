# blockchain-learning

A complete, code-first blockchain curriculum that takes you from zero to expert.
Twelve chapters, each backed by runnable TypeScript modules with unit tests, that
walk from raw cryptography all the way to ZK rollups, MEV, cross-chain messaging,
and on-chain analytics.

The goal: after finishing the chapters, exercises, and tests you should be
comfortable reading protocol specs (BIP / EIP / RFC), proposing and implementing
changes to consensus clients, smart-contract platforms, L2 systems, and
decentralized applications — and reasoning about their security properties.

## Curriculum

| #   | Chapter                            | What you learn                                                                                                                              |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Cryptography Primitives            | SHA-256, Keccak-256, RIPEMD-160, BLAKE2/3, HMAC, HKDF, secp256k1, Ed25519, ECDSA, Schnorr, BLS12-381, secp256r1, multisig, threshold sigs. |
| 02  | Hash-Based Data Structures         | Merkle trees (binary/odd-leaf), Merkle Mountain Ranges, Patricia/Merkle Patricia tries, Sparse Merkle trees, accumulator families.        |
| 03  | Encoding & Serialization           | hex, base58 / base58check, base64, Bech32m, varint (compact size), RLP, SSZ, CBOR.                                                          |
| 04  | Transactions & Signatures          | UTXO model, account model, legacy / EIP-2930 / EIP-1559 / EIP-4844 / EIP-7702 tx types, ECDSA recovery, BIP-32/BIP-39 HD wallets.         |
| 05  | Blocks & Chain Validation          | Block headers, version bits, difficulty epoch, target bounds, Merkle proof verification, fork-choice starters (heaviest, GHOST).          |
| 06  | Consensus Protocols                | PoW, PoS (Casper FFG), HotStuff / Tendermint BFT, longest-chain vs BFT, PoH (Solana), finality gadgets, slashing, fork choice rules.      |
| 07  | State & Storage                    | Account model state, world state trie, storage tries, journal / revert, snapshots & pruning, journal-and-replay, weak subjectivity.       |
| 08  | EVM Deep Dive                      | Opcodes, gas accounting, memory model, transient storage (EIP-1153), precompiles, CREATE / CREATE2 / SELFDESTRUCT, EOF (EIP-3540).       |
| 09  | Smart Contract Patterns            | Pull-payment, checks-effects-interactions, reentrancy guards, ERC-20/721/1155/4626, upgradeability (UUPS/transparent), assembly, gas.   |
| 10  | P2P Networking                     | devp2p / libp2p, RLPx, Discovery v4 / v5, Kademlia DHT, transaction gossip, block gossip, snap sync.                                        |
| 11  | L2 & Scaling                       | Optimistic rollups (fault proofs, fraud proofs), ZK rollups, state channels, plasma, bridges, data-availability sampling, DAS.         |
| 12  | Advanced Topics                    | MEV supply chain (searcher/builder/proposer/PBS), cross-chain messaging (IBC, light clients), privacy (Pedersen / zk), DeFi primitives. |

Every chapter has:

- A focused `src/<chapter>/` directory with code that runs.
- A `tests/<chapter>.test.ts` spec exercising every public function and core invariant.
- Inline commentary tying each function to the relevant BIP/EIP/RFC.

## Project layout

```
blockchain-learning/
├── src/
│   ├── 01-cryptography/       hashes, MACs, KDFs, curves, multisig
│   ├── 02-data-structures/    Merkle/Patricia/SMT/MMR
│   ├── 03-encoding/           hex/base58/bech32m/RLP/SSZ/CBOR
│   ├── 04-transactions/       UTXO, account, EIP-1559/4844, signing
│   ├── 05-blocks/             headers, target, validation
│   ├── 06-consensus/          PoW, PoS FFG, HotStuff, PoH
│   ├── 07-state/              account state, journal, snapshots
│   ├── 08-evm/                opcodes, gas, memory, precompiles
│   ├── 09-solidity-patterns/  secure contracts, ERC standards
│   ├── 10-networking/         devp2p, libp2p, DHT
│   ├── 11-layer2/             rollups, channels, bridges
│   └── 12-advanced/           MEV, IBC, privacy, DeFi
├── tests/                     one spec per chapter
├── scripts/run-all-demos.ts   executes every chapter demo
├── fixtures/                  static test vectors (BIPs / EIPs)
├── package.json
├── tsconfig.json              strict + noUncheckedIndexedAccess
├── tsconfig.build.json
├── vitest.config.ts
├── eslint.config.js
└── README.md
```

## How to study

1. Read the chapter header in the source file. Each starts with a `// Goal:` block
   that lists the protocol concepts the chapter teaches.
2. Read the chapters in order — `02` builds on the hashes from `01`, `04` uses
   signatures from `01` and encodings from `03`, and so on.
3. After each chapter, run `npx vitest run tests/<chapter>` to check your
   understanding by reading what is asserted.

## Quality gates

The repository passes each of these on a clean clone:

```bash
npm install
npm run typecheck      # tsc --noEmit, strict + noUncheckedIndexedAccess
npm test               # vitest run, every chapter spec
npm run lint           # eslint src tests
npm run build          # tsc -p tsconfig.build.json → dist/
npm run demo           # runs every chapter's demo (no external state)
```

## Tools used

All cryptography goes through audited libraries:

- **`@noble/hashes`** — SHA-2, Keccak, RIPEMD-160, BLAKE2/3, HMAC, HKDF, Poseidon-like.
- **`@noble/curves`** — secp256k1, ed25519, BLS12-381, secp256r1, ECDSA/Schnorr.
- **`@scure/bip32`** / **`@scure/bip39`** — Hierarchical Deterministic wallets, mnemonic generation.
- **`@scure/base`** — Base58 / Bech32m / base64 / hex encodings.

The code is organized so each concept is implemented against the underlying
primitive, then wrapped in a protocol-faithful API.

## Conventions

- **Strict TypeScript**: every value has a precise type. `any` is forbidden.
  `noUncheckedIndexedAccess` is on, so every array/record access returns `T | undefined`.
- **Pure functions** wherever possible; classes only when state belongs together.
- **No network, no filesystem, no randomness from global state** in core logic:
  - Randomness goes through the `Rng` interface, so tests are deterministic.
  - Hex/Binary I/O is explicit: every public function takes `Uint8Array`/`bigint`/typed object.
- **No crypto re-implementations** — we use `@noble/*` and `@scure/*` which are
  audited and used in production chains.
- **Every claim about a chain protocol** (gas, opcode cost, block header layout,
  fork IDs, EIP numbers) is sourced inline with a citation.

## Learning outcomes

A learner who completes every chapter and exercises will be able to:

- Read and reason about consensus, networking, and execution specifications.
- Implement wallet, transaction signing, and address derivation correctly.
- Write gas-efficient, secure smart contracts and audit them for known footguns.
- Reason about L2 trade-offs (optimistic vs ZK vs validia) and bridge designs.
- Identify and discuss MEV, censorship resistance, and finality.
- Implement a minimal EVM, a minimal consensus client, a minimal L2 sequencer,
  and the network layer that ties them together.
