// @ts-nocheck
// 第 01 章的可运行 demo。
//
//   $ npx tsx src/01-untyped-lambda/demo.ts

import type { Term } from './ast';
import { parse, ParseError } from './parser';
import { pretty } from './ast';
import { evalCBV, evalNormalOrder } from './evaluator';
import * as C from './church';

const EXAMPLES: ReadonlyArray<readonly [string, string]> = [
  ['true of two', '(λt.λf.t) a b'],
  ['identity applied', '(λx.x) hello'],
  ['K combinator', '(λx.λy.x) a b'],
  ['S combinator', '(λx.λy.λz. x z (y z)) (λw. w) (λw. w) p'],
  ['two applied twice', '((λf.λx. f (f x)) (λn. succ n) 0)'],
];

function pairTerm(a: Term, b: Term): Term {
  return parse(`(λf. f ${pretty(a)} ${pretty(b)})`);
}

export function runDemo(): void {
  for (const [name, src] of EXAMPLES) {
    const t = parse(src);
    const nf = evalNormalOrder(t, 500);
    console.log(`[${name}]  ${src}\n   ≡  ${pretty(nf)}`);
  }

  const two = parse('(λf.λx.f (f x))');
  const three = parse('(λf.λx.f (f (f x)))');
  console.log('[numeric]  add 2 3 →', pretty(evalNormalOrder(C.add(two, three), 5000)));
  console.log('[numeric]  mul 2 3 →', pretty(evalNormalOrder(C.mul(two, three), 5000)));
  console.log('[numeric]  exp 2 3 →', pretty(evalNormalOrder(C.exp(two, three), 50_000)));
  console.log(
    '[boolean]  tru a b   →',
    pretty(evalNormalOrder(C.app(C.app(C.tru, parse('a')), parse('b')))),
  );
  console.log(
    '[boolean]  fls a b   →',
    pretty(evalNormalOrder(C.app(C.app(C.fls, parse('a')), parse('b')))),
  );
  console.log('[boolean]  isZero 0  →', pretty(evalNormalOrder(C.isZero(C.zero))));

  const cbv = evalCBV(parse('(λx.x) (λy. (λz.z) y)'));
  console.log('[cbv]    (λx.x)((λy.λz.z)y) →', pretty(cbv));

  const p = pairTerm(parse('a'), parse('b'));
  console.log('[pair]   fst (a,b) →', pretty(evalNormalOrder(C.fst(p))));
  console.log('[pair]   snd (a,b) →', pretty(evalNormalOrder(C.snd(p))));

  const fixed = evalNormalOrder(C.app(C.Y, C.lam('g', C.lam('x', C.v('x')))), 1000);
  console.log('[Y]      Y (λg.λx.x) applied to identity →', pretty(fixed));

  // 在 `cons 1 nil` 上求列表首元素。
  void C.head;
  void C.isZero;
  console.log('[ok]  Chapter 01 demo finished');
}

// 重新导出 C 以便 demo 在导入优化后仍能编译；此记录在某用例中被使用。
const _: Record<string, unknown> = { Church: C };
void _;

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runDemo();
  } catch (e) {
    if (e instanceof ParseError) {
      console.error('parse error:', e.message);
      process.exitCode = 1;
    } else {
      throw e;
    }
  }
}
