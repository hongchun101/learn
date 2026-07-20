import type { Type } from '../src/06-system-f/ast';

function substType(x: string, τ: Type, σ: Type): Type {
  console.log('sub', x, τ.kind, σ.kind, JSON.stringify(σ));
  switch (σ.kind) {
    case 'var':
      return σ.name === x ? τ : σ;
    case 'fun':
      return {
        kind: 'fun',
        param: substType(x, τ, σ.param),
        body: substType(x, τ, σ.body),
      };
    case 'all':
      if (σ.var === x) return σ;
      return { kind: 'all', var: σ.var, body: substType(x, τ, σ.body) };
  }
}

const body: Type = { kind: 'fun', param: { kind: 'var', name: 'α' }, body: { kind: 'var', name: 'α' } };
const Bool: Type = { kind: 'var', name: 'Bool' };
console.log('result', JSON.stringify(substType('α', Bool, body), null, 2));
