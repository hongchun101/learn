import { graphFromEdges, bellmanFord, dijkstra, ecmpNextHops, bgpBestPath, bgpExportFilter, bgpImport, BgpRoute } from './routing.js';

export function demo(): void {
  const g = graphFromEdges([
    ['A', 'B', 1], ['B', 'C', 1], ['C', 'D', 1], ['A', 'D', 5],
    ['B', 'D', 3],
  ]);

  console.log('[07] Bellman-Ford from A:');
  for (const e of bellmanFord(g, 'A')) console.log(`  ${e.destination}: cost=${e.cost} via ${e.nextHop}`);

  console.log('[07] Dijkstra from A:');
  for (const e of dijkstra(g, 'A')) console.log(`  ${e.destination}: cost=${e.cost} path=${e.path.join('→')}`);

  console.log('[07] ECMP from A to D:', ecmpNextHops(g, 'A', 'D'));

  const routes: BgpRoute[] = [
    { network: '10.0.0.0/8', asPath: [65200, 65201], localPref: 100, med: 0, nextHop: '10.0.0.1', origin: 65001 },
    { network: '10.0.0.0/8', asPath: [65200, 65202, 65203], localPref: 200, med: 0, nextHop: '10.0.0.2', origin: 65001 },
    { network: '10.0.0.0/8', asPath: [65204], localPref: 100, med: 5, nextHop: '10.0.0.3', origin: 65001 },
  ];
  const best = bgpBestPath(routes);
  console.log('[07] BGP best path:', best?.asPath, 'localPref=', best?.localPref);

  const imported = bgpImport(routes, 65000);
  console.log('[07] After import as AS 65000:');
  for (const r of imported) console.log(`  ${r.network} asPath=${r.asPath.join(' ')} localPref=${r.localPref}`);

  console.log('[07] Export filter (no own AS in path):', bgpExportFilter(imported, 65000).length);
}
