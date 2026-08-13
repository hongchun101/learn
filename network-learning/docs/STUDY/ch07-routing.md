# Chapter 07 — Routing & Switching

## Goal

After this chapter you should be able to:

- Run Bellman-Ford and Dijkstra on a small graph.
- Explain the difference between distance-vector and link-state.
- Decide when BGP picks one path over another (local-pref, AS-path,
  origin, MED).
- Apply ECMP to a graph with multiple equal-cost paths.
- Diagnose count-to-infinity and how to mitigate it.

## Prerequisites

Chapter 05 (TCP) helps with the IGP vs EGP intuition.

## Walkthrough

1. **Bellman-Ford.** `bellmanFord(graph, source)` returns the
   `(dest, cost, next-hop)` vector. It's the algorithm that powers
   RIP.
2. **Dijkstra.** `dijkstra(graph, source)` returns the shortest-path
   tree. It's the algorithm that powers OSPF and IS-IS.
3. **DV round.** `dvRound` simulates one round of distance-vector
   exchange; useful for understanding count-to-infinity and split
   horizon.
4. **ECMP.** `ecmpNextHops` returns all equal-cost next-hops.
5. **BGP.** `bgpBestPath` implements the decision process:
   - Highest local-pref.
   - Shortest AS-path.
   - Lowest origin (IGP < EGP < Incomplete).
   - Lowest MED.
   - eBGP over iBGP.
   - Lowest IGP cost to next-hop.
   - Oldest route.
   - Lowest router ID.

Run `npx tsx src/07-routing/demo.ts`.

## Exercises

1. **Bellman-Ford.** Apply BF to a 4-node graph and identify the
   convergence rounds.
2. **Dijkstra.** Apply Dijkstra to the same graph. Compare.
3. **ECMP.** Build a graph with two equal-cost paths and confirm
   ECMP returns both.
4. **BGP.** Pick the best from a set of three BGP routes with
   different local-prefs and AS-path lengths.
5. **Count-to-infinity.** With a 3-node line topology, simulate
   a link failure and see the cost climb.

### Answers (sketch)

1. RIP converges in O(V·E) rounds.
2. Dijkstra is O((V+E) log V).
3. ECMP returns both paths.
4. The decision process walks the priority order.
5. Split horizon + poison reverse shorten the climb.

## Common pitfalls

- **Bellman-Ford negative cycles.** The implementation assumes
  non-negative weights; otherwise you need detection.
- **ECMP hashing.** Real routers hash a 5-tuple, not just the
  destination. Per-flow consistency is required.
- **BGP path hiding.** A withdrawn route is not re-evaluated by
  other speakers automatically.
- **Route reflectors.** Used to scale iBGP; loop detection requires
  ORIGINATOR_ID and CLUSTER_LIST.

## Interview questions

1. **Why is OSPF link-state but RIP distance-vector?** Trade-off:
   OSPF converges faster and scales better; RIP is dead simple.
2. **What is split horizon?** Don't advertise a route back to the
   neighbour you learned it from.
3. **Why does BGP not converge instantly?** Path attributes must be
   compared in order; ties are possible.
4. **When does BGP choose eBGP over iBGP?** After every other
   tie-breaker; eBGP is preferred because it crosses an AS boundary.
5. **What's the role of MED?** Hint to neighbours about the preferred
   entry point.

## What to build

A `bgpSimulator` that takes a small AS graph and runs the decision
process until quiescence. Then add a `flowSpec` filter.

## References

- RFC 2453 (RIP).
- RFC 2328 (OSPF).
- RFC 4271 (BGP).
- Doyle & Carroll, "Routing TCP/IP".
