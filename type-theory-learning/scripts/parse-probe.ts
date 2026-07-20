import { parse } from '../src/01-untyped-lambda/parser';
import { pretty } from '../src/01-untyped-lambda/ast';
import { evalCBV, evalNormalOrder } from '../src/01-untyped-lambda/evaluator';

const t = parse('(λx.x) ((λy.λz.z) y)');
console.log('parsed:', pretty(t));
console.log('NO nf:', pretty(evalNormalOrder(t, 1000)));
console.log('CBV nf:', pretty(evalCBV(t, 1000)));
