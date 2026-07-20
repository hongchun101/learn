import { describe, it, expect } from 'vitest';
import { apply, exact, intro, proof } from '../pipeline';
import { preservationStmt, progressStmt, stlcLean, systemFLean } from '../lean-snippets';

describe('30 theorem provers', () => {
  it('records steps in a proof', () => {
    const p = proof('HasType [] (lam x, x) (bool → bool)');
    let cur = intro(p);
    cur = apply(cur, 'Lam');
    cur = exact(cur, 'rfl');
    expect(cur.steps).toEqual(['intro', 'apply Lam', 'exact rfl']);
  });

  it('Lean reference strings are non-empty', () => {
    expect(stlcLean).toContain('Tm');
    expect(systemFLean).toContain('all');
    expect(preservationStmt).toContain('preservation');
    expect(progressStmt).toContain('progress');
  });
});
