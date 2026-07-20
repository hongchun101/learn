// =============================================================================
// Chapter 04 — Information Architecture
// =============================================================================

import type { IaNode } from './models.js';

/** Depth of a node in the IA tree. The root is depth 0. */
export function nodeDepth(tree: IaNode, id: string, currentDepth = 0): number {
  if (tree.id === id) return currentDepth;
  for (const c of tree.children) {
    const found = nodeDepth(c, id, currentDepth + 1);
    if (found >= 0) return found;
  }
  return -1;
}

/** Walk the tree depth-first, yielding each node once. */
export function* walkIa(tree: IaNode): Generator<IaNode> {
  yield tree;
  for (const c of tree.children) yield* walkIa(c);
}

/** Number of nodes in the tree. */
export function nodeCount(tree: IaNode): number {
  let n = 0;
  for (const _ of walkIa(tree)) n++;
  return n;
}
/** Maximum depth of the tree. */
export function maxDepth(tree: IaNode): number {
  if (tree.children.length === 0) return 0;
  return 1 + Math.max(...tree.children.map(maxDepth));
}

/**
 * Card-sort distance: how well a sort matches the target grouping. 0 = perfect,
 * 1 = every card is in the wrong group.
 */
export function cardSortAgreement(
  predicted: ReadonlyArray<{ id: string; group: string }>,
  truth: ReadonlyArray<{ id: string; group: string }>,
): number {
  if (predicted.length === 0 || predicted.length !== truth.length) {
    throw new Error('predictions and truth must be same length and non-empty');
  }
  const truthById = new Map(truth.map((t) => [t.id, t.group]));
  let disagree = 0;
  for (const p of predicted) {
    if (truthById.get(p.id) !== p.group) disagree += 1;
  }
  return disagree / predicted.length;
}

/** Tree shape: number of "fan-out" violations (parents with > 7 children). */
export function fanOutViolations(
  tree: IaNode,
  threshold = 7,
): ReadonlyArray<{ parentId: string; childCount: number }> {
  const out: { parentId: string; childCount: number }[] = [];
  for (const n of walkIa(tree)) {
    if (n.children.length > threshold) {
      out.push({ parentId: n.id, childCount: n.children.length });
    }
  }
  return out;
}

/** Detect "orphans" — pages with no inbound link. */
export function orphanPages(
  pages: ReadonlyArray<string>,
  links: ReadonlyArray<{ from: string; to: string }>,
): string[] {
  const reachable = new Set<string>();
  for (const l of links) reachable.add(l.to);
  return pages.filter((p) => !reachable.has(p));
}

/** Reachability — from `start`, can we reach `target`? BFS. */
export function canReach(
  links: ReadonlyArray<{ from: string; to: string }>,
  start: string,
  target: string,
): boolean {
  const graph = new Map<string, string[]>();
  for (const l of links) {
    const bucket = graph.get(l.from) ?? [];
    bucket.push(l.to);
    graph.set(l.from, bucket);
  }
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === target) return true;
    for (const next of graph.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}
