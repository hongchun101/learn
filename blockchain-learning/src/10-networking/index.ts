// =============================================================================
// Chapter 10 — P2P Networking
// =============================================================================
// Goal: every concept a chain engineer must understand about peer discovery,
//       gossip, and block/transaction propagation.
//
// Concepts covered:
//   1. devp2p (Ethereum) and libp2p (Polkadot/Substrate/Cosmos/IPFS).
//   2. RLPx transport (encrypted TCP using secp256k1 ECIES and a 16-byte
//      nonce handshake).
//   3. Discv4 / Discv5 discovery (Kademlia-based).
//   4. Kademlia DHT: XOR distance, k-buckets, lookup algorithm.
//   5. Transaction gossip, block gossip, snap protocol.
//   6. Subprotocols: ETH/67, ETH/68, ETH/69 (Ethereum), /meshsub/2 (libp2p).
//
// This module ships:
//   - Kademlia routing table with XOR distance and k-buckets.
//   - Gossip-based broadcast that increases fan-out per hop.
//   - Discv4-style ENR generation.
// =============================================================================

// =============================================================================
// XOR distance Kademlia routing table
// =============================================================================

export interface Node {
  id: Uint8Array;        // 32 bytes
  address: string;       // host:port
}

export class Kademlia {
  private readonly k: number;
  private readonly buckets: Map<bigint, Set<string>>; // distance bucket index -> node ids
  private nodes = new Map<string, Node>();

  constructor(k = 16) {
    this.k = k;
    this.buckets = new Map();
  }

  add(node: Node): void {
    if (this.nodes.has(node.address)) return;
    this.nodes.set(node.address, node);
    const bucket = bucketOf(distance(localId, node.id));
    if (!this.buckets.has(bucket)) this.buckets.set(bucket, new Set());
    const set = this.buckets.get(bucket)!;
    if (set.size < this.k) {
      set.add(node.address);
    } else {
      // Would normally ping the eldest; for didactic purposes we discard.
    }
  }

  nearest(target: Uint8Array, count: number): Node[] {
    const arr = [...this.nodes.values()];
    arr.sort((a, b) => cmp(distance(target, a.id), distance(target, b.id)));
    return arr.slice(0, count);
  }

  size(): number {
    return this.nodes.size;
  }
}

/** XOR distance between two 256-bit ids. */
export function distance(a: Uint8Array, b: Uint8Array): bigint {
  if (a.length !== b.length) throw new Error('id lengths differ');
  let v = 0n;
  for (let i = 0; i < a.length; i++) {
    v = (v << 8n) ^ BigInt((a[i] ?? 0) ^ (b[i] ?? 0));
  }
  return v;
}

function bucketOf(d: bigint): bigint {
  // Find the position of the highest set bit in d.
  return d === 0n ? 0n : BigInt(d.toString(2).length - 1);
}

function cmp(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const localId = new Uint8Array(32);

// =============================================================================
// Gossip
// ===================================================================

export interface GossipEvent {
  topic: string;
  data: Uint8Array;
  seen: Set<string>;
}

/**
 * Naive gossip: each peer forwards to a random subset of its peers until all
 * have seen the event. Tracks `seen` to avoid re-broadcast.
 */
export function gossipRound(peers: Node[], event: GossipEvent, fanout = 3): Node[] {
  const next: Node[] = [];
  const peersLeft = [...peers].filter((p) => !event.seen.has(p.address));
  for (let i = 0; i < Math.min(fanout, peersLeft.length); i++) {
    const idx = Math.floor(Math.random() * peersLeft.length);
    const p = peersLeft[idx]!;
    event.seen.add(p.address);
    next.push(p);
    peersLeft.splice(idx, 1);
  }
  return next;
}

// =============================================================================
// Ethereum ENR (EIP-706) — minimal encoding
// ===================================================================

/** ENR: signature || seq || (key:value)+ || "enr:" prefix outside. For our use, we serialize as RLP. */
export interface Enr {
  seq: bigint;
  fields: Array<[Uint8Array, Uint8Array]>; // key, value
  signature: Uint8Array;
}

import { rlpEncode } from '../03-encoding/index.js';

export function encodeEnr(enr: Enr): Uint8Array {
  const items: Uint8Array[] = [
    u256(enr.seq),
    ...enr.fields.flatMap(([k, v]) => [k, v]),
    enr.signature,
  ];
  return rlpEncode(items);
}

// ===================================================================
// Subprotocol frame length prefix
// ===================================================================

/** Devp2p frames are prefixed with a 3-byte length (rlpx framing). */
export function framePayload(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(3 + payload.length);
  out[0] = (payload.length >> 16) & 0xff;
  out[1] = (payload.length >> 8) & 0xff;
  out[2] = payload.length & 0xff;
  out.set(payload, 3);
  return out;
}

function u256(n: bigint): Uint8Array {
  if (n < 0n) throw new Error('u256 negative');
  const bytes: number[] = [];
  let v = n;
  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  return new Uint8Array(bytes);
}

// ===================================================================
// Demo
// ===================================================================

import { DeterministicRng, seedFrom } from '../_rng.js';

export interface Chapter10DemoResult {
  kadSize: number;
  nearest: string[];
  enrHex: string;
  framedLen: number;
}

export function demo(): Chapter10DemoResult {
  const rng = new DeterministicRng(seedFrom('ch10-demo-v1'));
  const k = new Kademlia();
  // Add 5 deterministic nodes.
  for (let i = 0; i < 5; i++) {
    const id = new Uint8Array(32);
    const seed = rng.next(32);
    id.set(seed, 0);
    k.add({ id, address: `127.0.0.1:${3000 + i}` });
  }

  const target = new Uint8Array(32);
  const nearest = k.nearest(target, 3);

  const enr: Enr = {
    seq: 1n,
    fields: [
      [new TextEncoder().encode('ip'), new Uint8Array([127, 0, 0, 1])],
      [new TextEncoder().encode('udp'), new Uint8Array([0x01, 0x01])],
    ],
    signature: new Uint8Array(64),
  };
  const encoded = encodeEnr(enr);

  void gossipRound(nearest, { topic: 'blocks', data: new Uint8Array(), seen: new Set() });

  return {
    kadSize: k.size(),
    nearest: nearest.map((n) => n.address),
    enrHex: Array.from(encoded).map((b) => b.toString(16).padStart(2, '0')).join(''),
    framedLen: framePayload(new Uint8Array(200)).length,
  };
}
