// =============================================================================
// Chapter 09 — Platform Products
// =============================================================================
// Goal: a platform is a product that other products build on. The chapter
// covers network effects, two-sided markets, ecosystem health, and the
// "build vs join" decision for an external platform.
//
// References:
//   * Parker, Van Alstyne & Choudary, "Platform Revolution", 2016.
//   * Andrei Hagiu, "Multi-Sided Platforms", HBS cases.
// =============================================================================

export interface Platform {
  readonly id: string;
  /** Producers (supply side). */
  readonly producers: number;
  /** Consumers (demand side). */
  readonly consumers: number;
  /** Transactions per period. */
  readonly transactions: number;
  /** Take rate, 0..1. */
  readonly takeRate: number;
  /** Average transaction value. */
  readonly avgTransactionValue: number;
}

/** Gross merchandise volume. */
export function gmv(p: Platform): number {
  return p.transactions * p.avgTransactionValue;
}

/** Platform net revenue. */
export function platformRevenue(p: Platform): number {
  return gmv(p) * p.takeRate;
}

/** Metcalfe's law — the value of a network is ~ k × n². */
export function metcalfeValue(n: number, k = 1): number {
  return k * n * n;
}

/** Reed's law — the value of a network with all subgroups, ~ 2^n. */
export function reedValue(n: number, k = 1): number {
  if (n > 30) return Number.POSITIVE_INFINITY; // overflow guard
  return k * Math.pow(2, n);
}

/** Cross-side network effect — how much a new consumer is worth to a producer. */
export function crossSideEffect(consumers: number, producers: number): number {
  if (producers === 0) return 0;
  return consumers / producers;
}

/** Cold-start problem: minimum viable two-sided marketplace. */
export function minimumViableMarketplace(
  targetTransactions: number,
  consumersPerProducer: number,
  averageTransactionsPerConsumer: number,
): { producers: number; consumers: number } {
  if (averageTransactionsPerConsumer <= 0 || consumersPerProducer <= 0) {
    throw new Error('invalid inputs');
  }
  const consumers = targetTransactions / averageTransactionsPerConsumer;
  const producers = consumers / consumersPerProducer;
  return { producers, consumers };
}

/** Liquidity ratio — share of consumers that transact per period. */
export function liquidity(p: Platform): number {
  if (p.consumers === 0) return 0;
  return p.transactions / p.consumers;
}

/** Healthy platform: liquidity > 0.25 and producer/consumer ratio in range. */
export function isHealthy(p: Platform): { healthy: boolean; liquidity: number; ratio: number } {
  const liq = liquidity(p);
  const ratio = p.consumers === 0 ? 0 : p.producers / p.consumers;
  return { healthy: liq > 0.25 && ratio > 0.001 && ratio < 100, liquidity: liq, ratio };
}
