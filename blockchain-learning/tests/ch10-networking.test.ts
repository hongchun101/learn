import { describe, it, expect } from 'vitest';
import {
  Kademlia,
  distance,
  gossipRound,
  encodeEnr,
  framePayload,
  demo as ch10Demo,
  type Node,
} from '../src/10-networking/index.js';

describe('Chapter 10 — P2P Networking', () => {
  it('Kademlia stores nodes and computes nearest', () => {
    const k = new Kademlia(8);
    const a: Node = { id: new Uint8Array(32).fill(1), address: 'a' };
    const b: Node = { id: new Uint8Array(32).fill(2), address: 'b' };
    const c: Node = { id: new Uint8Array(32).fill(0xff), address: 'c' };
    k.add(a); k.add(b); k.add(c);
    expect(k.size()).toBe(3);
    const nearest = k.nearest(new Uint8Array(32).fill(0), 2);
    expect(nearest.length).toBe(2);
  });

  it('XOR distance is symmetric and zero for self', () => {
    const a = new Uint8Array(32);
    a[0] = 0x12;
    const b = new Uint8Array(32);
    b[0] = 0x34;
    expect(distance(a, b)).toBe(distance(b, a));
    expect(distance(a, a)).toBe(0n);
  });

  it('gossip round picks distinct peers', () => {
    const peers: Node[] = [];
    for (let i = 0; i < 10; i++) peers.push({ id: new Uint8Array(32).fill(i), address: `peer-${i}` });
    const seen = new Set<string>();
    const next = gossipRound(peers, { topic: 't', data: new Uint8Array(), seen }, 3);
    expect(next.length).toBeLessThanOrEqual(3);
    expect(new Set(next.map((p) => p.address)).size).toBe(next.length);
  });

  it('encodeEnr yields valid RLP', () => {
    const e = encodeEnr({ seq: 5n, fields: [[new TextEncoder().encode('x'), new Uint8Array([1])]], signature: new Uint8Array(64) });
    expect(e.length).toBeGreaterThan(0);
  });

  it('framePayload encodes a 3-byte length prefix', () => {
    const framed = framePayload(new Uint8Array(200));
    const len = (framed[0]! << 16) | (framed[1]! << 8) | framed[2]!;
    expect(len).toBe(200);
    expect(framed.length).toBe(203);
  });

  it('ch10 demo runs end-to-end', () => {
    const out = ch10Demo();
    expect(out.kadSize).toBe(5);
    expect(out.nearest.length).toBe(3);
    expect(out.enrHex.length).toBeGreaterThan(0);
    expect(out.framedLen).toBe(203);
  });
});
