// Strong normalization via the chapter 01 normal-order evaluator.

import { evalNormalOrder, NonNormalizable } from '../01-untyped-lambda/evaluator';
import { parse } from '../01-untyped-lambda/parser';
import type { Term } from '../01-untyped-lambda/ast';

export function normalizesWithin(t: Term, fuel = 1000): boolean {
  try {
    evalNormalOrder(t, fuel);
    return true;
  } catch (e) {
    if (e instanceof NonNormalizable) return false;
    throw e;
  }
}

export const normalize = (s: string, fuel?: boolean): boolean => normalizesWithin(parse(s), fuel ? 100 : 1000);

void normalize;
