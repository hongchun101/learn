import { describe, it, expect } from 'vitest';
import {
  graphFromEdges, bellmanFord, dijkstra, ecmpNextHops,
  bgpBestPath, bgpImport, bgpExportFilter,
  demo as ch07Demo,
} from '../src/07-routing/index.js';

describe('07 — Bellman-Ford', () => {
  it('computes shortest paths', () => {
    const g = graphFromEdges([['A','B',1],['B','C',1],['A','C',5]]);
    const dv = bellmanFord(g, 'A');
    const ac = dv.find((e) => e.destination === 'C')!;
    expect(ac.cost).toBe(2);
    expect(ac.nextHop).toBe('B');
  });
});

describe('07 — Dijkstra', () => {
  it('finds the shortest path', () => {
    const g = graphFromEdges([['A','B',1],['B','C',1],['A','C',5],['B','D',3]]);
    const r = dijkstra(g, 'A');
    const d = r.find((e) => e.destination === 'D')!;
    expect(d.cost).toBe(4);
    expect(d.path).toEqual(['A', 'B', 'D']);
  });
  it('handles a triangle with one direct edge', () => {
    const g = graphFromEdges([['A','B',1],['B','C',1],['A','C',3]]);
    expect(dijkstra(g, 'A').find((e) => e.destination === 'C')!.cost).toBe(2);
  });
});

describe('07 — ECMP', () => {
  it('returns both equal-cost next-hops', () => {
    const g = graphFromEdges([['A','B',1],['A','C',1],['B','D',1],['C','D',1]]);
    expect(ecmpNextHops(g, 'A', 'D').sort()).toEqual(['B', 'C']);
  });
});

describe('07 — BGP', () => {
  it('picks the highest localPref', () => {
    const routes = [
      { network: '10/8', asPath: [1, 2], localPref: 100, med: 0, nextHop: 'h1', origin: 1 },
      { network: '10/8', asPath: [1, 2, 3], localPref: 200, med: 0, nextHop: 'h2', origin: 1 },
    ];
    expect(bgpBestPath(routes)?.nextHop).toBe('h2');
  });
  it('prefers shorter AS-path on tie', () => {
    const routes = [
      { network: '10/8', asPath: [1, 2, 3], localPref: 100, med: 0, nextHop: 'h1', origin: 1 },
      { network: '10/8', asPath: [1, 2], localPref: 100, med: 0, nextHop: 'h2', origin: 1 },
    ];
    expect(bgpBestPath(routes)?.nextHop).toBe('h2');
  });
  it('filters out routes containing our AS', () => {
    const routes = [
      { network: '10/8', asPath: [42, 100, 1], localPref: 100, med: 0, nextHop: 'h1', origin: 1 },
    ];
    expect(bgpExportFilter(routes, 42).length).toBe(0);
  });
  it('prepends AS on import', () => {
    const routes = [{ network: '10/8', asPath: [1, 2], localPref: 0, med: 0, nextHop: 'h1', origin: 1 }];
    const out = bgpImport(routes, 42);
    expect(out[0]?.asPath).toEqual([42, 1, 2]);
    expect(out[0]?.localPref).toBe(100);
  });
});

describe('07 — demo', () => {
  it('runs end-to-end', () => {
    expect(() => ch07Demo()).not.toThrow();
  });
});
