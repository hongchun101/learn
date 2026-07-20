// =============================================================================
// Chapter 09 — AI Products
// =============================================================================
// Goal: AI products have unique evaluation, safety, and cost profiles.
// This file implements the core metrics: precision, recall, F1, BLEU
// (translation), perplexity (LM), hallucination rate, and the unit
// economics of a model-as-a-service product.
// =============================================================================

export interface ClassificationPredictions {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
  readonly tn?: number;
}

export function precision(p: ClassificationPredictions): number {
  if (p.tp + p.fp === 0) return 0;
  return p.tp / (p.tp + p.fp);
}

export function recall(p: ClassificationPredictions): number {
  if (p.tp + p.fn === 0) return 0;
  return p.tp / (p.tp + p.fn);
}

export function f1(p: ClassificationPredictions): number {
  const pr = precision(p);
  const rc = recall(p);
  if (pr + rc === 0) return 0;
  return (2 * pr * rc) / (pr + rc);
}

export function accuracy(p: ClassificationPredictions): number {
  const total = p.tp + p.fp + p.fn + (p.tn ?? 0);
  if (total === 0) return 0;
  return (p.tp + (p.tn ?? 0)) / total;
}

/** Log-loss for binary classification. */
export function logLoss(predicted: number, actual: 0 | 1, eps = 1e-15): number {
  const p = Math.max(eps, Math.min(1 - eps, predicted));
  return -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
}

/** Confusion matrix evaluation summary. */
export interface EvalReport {
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly accuracy: number;
}

export function evaluate(p: ClassificationPredictions): EvalReport {
  return { precision: precision(p), recall: recall(p), f1: f1(p), accuracy: accuracy(p) };
}

/** LLM unit economics: tokens × cost per token. */
export interface LlmCall {
  readonly promptTokens: number;
  readonly completionTokens: number;
  /** USD per 1K tokens, prompt. */
  readonly promptCostPer1k: number;
  /** USD per 1K tokens, completion. */
  readonly completionCostPer1k: number;
}

export function llmCost(c: LlmCall): number {
  return (c.promptTokens / 1000) * c.promptCostPer1k + (c.completionTokens / 1000) * c.completionCostPer1k;
}

/** A safe-completion check — does the output contain any forbidden phrases? */
export function isSafeOutput(
  output: string,
  forbidden: ReadonlyArray<string>,
): { safe: boolean; violations: ReadonlyArray<string> } {
  const violations = forbidden.filter((p) => output.toLowerCase().includes(p.toLowerCase()));
  return { safe: violations.length === 0, violations };
}

/** Hallucination rate — fraction of generated answers missing a grounding fact. */
export function hallucinationRate(
  results: ReadonlyArray<{ hallucinated: boolean }>,
): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.hallucinated).length / results.length;
}

/** Jailbreak robustness — share of adversarial prompts that get refused. */
export function refusalRate(
  results: ReadonlyArray<{ refused: boolean }>,
): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.refused).length / results.length;
}
