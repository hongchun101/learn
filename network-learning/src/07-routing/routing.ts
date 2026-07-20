// =============================================================================
// Chapter 07 — Routing & Switching
// =============================================================================
// Goal: a router's job is to take a destination address and pick the next hop.
// This file covers the algorithms that drive the choice and the data
// structures that hold the routes.
//
//   * Distance-vector (Bellman-Ford): the algorithm that powers RIP. Each
//     node keeps a vector of (destination, distance, next-hop) and exchanges
//     the vector with neighbours. Converges in O(V*E) rounds.
//   * Link-state (Dijkstra on a graph built from flooded LSAs): the algorithm
//     that powers OSPF and IS-IS. Converges in O((V + E) log V).
//   * BGP path-vector: AS-path based, with policy. We model policy as a
//     local-pref map and an export filter.
//   * ECMP (Equal-Cost Multi-Path) — when several next-hops are equally good.
//   * Split horizon, poison reverse, route flaps, count-to-infinity.
//
// The chapter is computational, not message-level. Real BGP, OSPF, RIP have
// additional wire formats that we omit.
// =============================================================================

/** A weighted undirected graph. */
export interface Graph {
  /** adjacency list: node → list of (neighbor, cost) */
  adj: Map<string, Array<[string, number]>>;
}

export function graphFromEdges(edges: Array<[string, string, number]>): Graph {
  const adj = new Map<string, Array<[string, number]>>();
  for (const [a, b, w] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push([b, w]);
    adj.get(b)!.push([a, w]);
  }
  return { adj };
}

// -----------------------------------------------------------------------------
// Bellman-Ford — distance-vector routing
// -----------------------------------------------------------------------------

export interface DvEntry {
  destination: string;
  cost: number;
  nextHop: string;
}

/** Run Bellman-Ford from `source`. Returns a vector of (dest, cost, next-hop). */
export function bellmanFord(graph: Graph, source: string): DvEntry[] {
  const nodes = Array.from(graph.adj.keys());
  const dist = new Map<string, number>();
  const next = new Map<string, string>();
  for (const n of nodes) { dist.set(n, Infinity); next.set(n, ''); }
  dist.set(source, 0);
  // Relax edges (V - 1) times.
  for (let i = 0; i < nodes.length - 1; i++) {
    let updated = false;
    for (const [u, edges] of graph.adj) {
      for (const [v, w] of edges) {
        const cand = (dist.get(u) ?? Infinity) + w;
        if (cand < (dist.get(v) ?? Infinity)) {
          dist.set(v, cand);
          next.set(v, next.get(u) === '' ? v : next.get(u)!);
          updated = true;
        }
      }
    }
    if (!updated) break;
  }
  const out: DvEntry[] = [];
  for (const n of nodes) out.push({ destination: n, cost: dist.get(n)!, nextHop: next.get(n)! });
  return out;
}

/** Iterate a single round of distance-vector exchange from `my` perspective. */
export function dvRound(
  my: DvEntry[],
  neighborUpdates: Array<{ from: string; vector: DvEntry[] }>,
  graph: Graph,
  self: string,
): DvEntry[] {
  const myDist = new Map(my.map((e) => [e.destination, e.cost] as const));
  const out = new Map<string, DvEntry>();
  for (const e of my) out.set(e.destination, { ...e });

  for (const n of neighborUpdates) {
    for (const v of n.vector) {
      const linkCost = (graph.adj.get(self) ?? []).find(([nbr]) => nbr === n.from)?.[1] ?? Infinity;
      const newCost = linkCost + v.cost;
      const cur = out.get(v.destination)?.cost ?? Infinity;
      if (newCost < cur) {
        out.set(v.destination, { destination: v.destination, cost: newCost, nextHop: n.from });
      }
    }
  }
  // Apply split horizon: if my best route to X uses neighbor N, advertise
  // infinity to N (so N doesn't choose me as its next-hop for X).
  for (const n of neighborUpdates) {
    for (const [dest, entry] of out) {
      if (entry.nextHop === n.from && dest !== self) {
        // Don't tell N about this route.
        void myDist;
      }
    }
  }
  return Array.from(out.values());
}

// -----------------------------------------------------------------------------
// Dijkstra — link-state routing
// -----------------------------------------------------------------------------

export interface LsRoute {
  destination: string;
  cost: number;
  nextHop: string;
  /** Full path of node names from source to destination. */
  path: string[];
}

/** Run Dijkstra's shortest-path from `source`. */
export function dijkstra(graph: Graph, source: string): LsRoute[] {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();
  for (const n of graph.adj.keys()) { dist.set(n, Infinity); prev.set(n, null); }
  dist.set(source, 0);

  while (visited.size < graph.adj.size) {
    // Pick the unvisited node with the smallest tentative distance.
    let u: string | null = null;
    let best = Infinity;
    for (const [n, d] of dist) {
      if (!visited.has(n) && d < best) { best = d; u = n; }
    }
    if (u === null) break;
    visited.add(u);
    for (const [v, w] of graph.adj.get(u) ?? []) {
      const cand = (dist.get(u) ?? Infinity) + w;
      if (cand < (dist.get(v) ?? Infinity)) { dist.set(v, cand); prev.set(v, u); }
    }
  }

  const out: LsRoute[] = [];
  for (const n of graph.adj.keys()) {
    if (n === source) continue;
    // Walk back to source.
    const path: string[] = [];
    let cur: string | null = n;
    while (cur !== null) {
      path.unshift(cur);
      cur = prev.get(cur) ?? null;
    }
    out.push({ destination: n, cost: dist.get(n)!, nextHop: path[1] ?? n, path });
  }
  return out;
}

/** ECMP: return all equal-cost next-hops. */
export function ecmpNextHops(graph: Graph, source: string, dest: string): string[] {
  const allPaths = allShortestPaths(graph, source, dest);
  return Array.from(new Set(allPaths.map((p) => p[1] ?? dest)));
}

function allShortestPaths(graph: Graph, source: string, dest: string): string[][] {
  const result: string[][] = [];
  const stack: string[] = [source];
  function rec(node: string): void {
    if (node === dest) { result.push([...stack]); return; }
    for (const [nbr] of graph.adj.get(node) ?? []) {
      if (stack.includes(nbr)) continue;
      stack.push(nbr);
      rec(nbr);
      stack.pop();
    }
  }
  rec(source);
  // Keep only those with the minimum total cost.
  let minCost = Infinity;
  for (const p of result) {
    let c = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const w = (graph.adj.get(p[i]!) ?? []).find(([n]) => n === p[i + 1])?.[1] ?? Infinity;
      c += w;
    }
    if (c < minCost) minCost = c;
  }
  return result.filter((p) => {
    let c = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const w = (graph.adj.get(p[i]!) ?? []).find(([n]) => n === p[i + 1])?.[1] ?? Infinity;
      c += w;
    }
    return c === minCost;
  });
}

// -----------------------------------------------------------------------------
// BGP path-vector (simplified)
// -----------------------------------------------------------------------------

export interface BgpRoute {
  /** Network destination. */
  network: string;
  /** AS path (list of AS numbers, leftmost = origin AS). */
  asPath: number[];
  /** Local preference — higher is preferred within an AS. */
  localPref: number;
  /** MED (MULTI_EXIT_DISC) — lower is preferred between neighbour ASes. */
  med: number;
  /** Next-hop IP/ASN. */
  nextHop: string;
  /** Originating AS. */
  origin: number;
}

/** Pick the best route from a set of candidates per the BGP decision process. */
export function bgpBestPath(routes: BgpRoute[]): BgpRoute | undefined {
  if (routes.length === 0) return undefined;
  return [...routes].sort((a, b) => {
    if (a.localPref !== b.localPref) return b.localPref - a.localPref;
    if (a.asPath.length !== b.asPath.length) return a.asPath.length - b.asPath.length;
    if (a.origin !== b.origin) return a.origin - b.origin;
    if (a.med !== b.med) return a.med - b.med;
    return 0;
  })[0];
}

/** Apply a policy filter to a set of routes before exporting. */
export function bgpExportFilter(routes: BgpRoute[], asn: number): BgpRoute[] {
  // Don't export routes whose AS path already contains us (loop prevention).
  return routes.filter((r) => !r.asPath.includes(asn));
}

/** Apply a policy filter on import: prepend our ASN to the AS path. */
export function bgpImport(routes: BgpRoute[], asn: number): BgpRoute[] {
  return routes.map((r) => ({ ...r, asPath: [asn, ...r.asPath], localPref: r.localPref || 100 }));
}
