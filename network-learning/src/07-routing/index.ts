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
//
// STUDY (read alongside docs/STUDY/ch07-routing.md)
// -----------------------------------------------------------------------------
// Prerequisites: Chapter 05 (TCP) helps with the IGP vs EGP intuition.
// Why it matters: routing is the substrate of every multi-hop network. The
// decision process, the failure modes, and the convergence properties are the
// difference between a network that routes correctly and one that flaps.



// Key invariants:
//   * Dijkstra is O((V+E) log V); Bellman-Ford is O(V·E). Plan accordingly.
//   * BGP decision order: local-pref → AS-path length → origin → MED →
//     eBGP over iBGP → IGP cost → age → router ID.
//   * Split horizon: never advertise a route back to the neighbour you
//     learned it from. Poison reverse: advertise it back with infinity.
//   * ECMP hashing must be per-flow (5-tuple) to keep session consistency.
// Common pitfalls:
//   * Negative-weight graphs break Dijkstra — use Bellman-Ford or Johnson.
//   * BGP path hiding: a withdrawn route is not re-evaluated by other
//     speakers automatically.
//   * Forgetting iBGP's full-mesh requirement or scaling with route
//     reflectors.
// Interview-ready summary: I can run Bellman-Ford, Dijkstra, BGP's decision
// process, and ECMP on a small graph and explain count-to-infinity.
// -----------------------------------------------------------------------------
// Study guide: docs/STUDY/ch07-routing.md
// Test:        tests/ch07-routing.test.ts
// Demo:        npx tsx src/07-routing/demo.ts
// =============================================================================

export { graphFromEdges, bellmanFord, dijkstra, ecmpNextHops, bgpBestPath, bgpExportFilter, bgpImport, dvRound } from './routing.js';
export type { Graph, DvEntry, LsRoute, BgpRoute } from './routing.js';
export { demo } from './demo.js';
