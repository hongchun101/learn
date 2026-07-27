type Var = string;
type Term = { kind: 'var'; name: Var } | { kind: 'lam'; param: Var; body: Term } | { kind: 'app'; func: Term; arg: Term };

function equal2(a: Term, b: Term): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'var': {
      // 显式转换
      const x = a as Extract<Term, { kind: 'var' }>;
      return x.name === (b as Extract<Term, { kind: 'var' }>).name;
    }
    default:
      return false;
  }
}
console.log(equal2({ kind: 'var', name: 'x' }, { kind: 'var', name: 'y' }));
