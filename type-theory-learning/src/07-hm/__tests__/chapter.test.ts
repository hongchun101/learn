import { describe, it, expect } from 'vitest';
import { typeOf, emptyEnv } from '../infer';

describe('07 Hindley-Milner', () => {
  it('infers the identity function as a → α', () => {
    const t = { kind: 'lam' as const, param: 'x', body: { kind: 'var' as const, name: 'x' } };
    const { t: τ } = typeOf(emptyEnv, t);
    expect(τ.kind).toBe('tfun');
  });

  it('rejects ill-typed application', () => {
    const t = {
      kind: 'app' as const,
      func: { kind: 'lam' as const, param: 'x', body: { kind: 'var' as const, name: 'x' } },
      arg: { kind: 'num' as const, value: 1 },
    };
    expect(() => typeOf(emptyEnv, t)).not.toThrow();
  });

  it('let polymorphism: id reused at two different types', () => {
    const term = {
      kind: 'let' as const,
      name: 'id',
      expr: { kind: 'lam' as const, param: 'x', body: { kind: 'var' as const, name: 'x' } },
      body: {
        kind: 'app' as const,
        func: { kind: 'app' as const, func: { kind: 'var' as const, name: 'id' }, arg: { kind: 'num' as const, value: 1 } },
        arg: { kind: 'var' as const, name: 'id' },
      },
    };
    expect(() => typeOf(emptyEnv, term)).not.toThrow();
  });
});
