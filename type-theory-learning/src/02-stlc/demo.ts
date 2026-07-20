// Demo for Chapter 02.

import { parse } from './parser';
import { prettyTy, pretty } from './ast';
import { infer } from './checker';
import { evalT } from './evaluator';
import { programs, runPreservation } from './preservation';

export function runDemo(): void {
  for (const [name, term] of programs()) {
    runPreservation(name, term);
    console.log(`[ok]  ${name}  ≡  ${pretty(term)}`);
  }

  const samples = [
    'λx : Bool. x',
    'λx : Bool. λy : Bool. x',
    '(λx : Bool. x) true',
    'λf : Bool → Bool. λx : Bool. f (f x)',
  ];
  for (const src of samples) {
    const t = parse(src);
    const tau = infer({ bindings: {} }, t);
    console.log(`[parse]  ${src}\n   ⇓  ${pretty(t)} : ${prettyTy(tau)}`);
  }

  const tru = parse('λx : Bool. λy : Bool. x');
  const fls = parse('λx : Bool. λy : Bool. y');
  const ite = parse('λp : Bool → Bool → Bool → Bool. λa : Bool. λb : Bool. p a b');
  console.log(`[church]  tru : ${prettyTy(infer({ bindings: {} }, tru))}`);
  console.log(`[church]  fls : ${prettyTy(infer({ bindings: {} }, fls))}`);
  console.log(`[church]  ite : ${prettyTy(infer({ bindings: {} }, ite))}`);

  const e1 = evalT(parse('(λx : Nat. succ x) 3'));
  console.log(`[eval]  (λx:Nat.succ x) 3 ≡ ${pretty(e1)}`);

  console.log('[ok]  Chapter 02 demo finished');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo();
}
