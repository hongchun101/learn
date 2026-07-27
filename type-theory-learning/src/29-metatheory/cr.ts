// 风格化的 Church-Rosser 收敛性检查。

import { evalNormalOrder } from '../01-untyped-lambda/evaluator';
import { alphaEq } from '../01-untyped-lambda/subst';
import type { Term } from '../01-untyped-lambda/ast';

export function crConverge(a: Term, b: Term, fuel = 5000): boolean {
  const na = evalNormalOrder(a, fuel);
  const nb = evalNormalOrder(b, fuel);
  return alphaEq(na, nb);
}
