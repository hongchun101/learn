import { describe, it, expect } from 'vitest';
import { decidesTermination, type Fun, type Call } from '../sizechange';
import { fromArray, take, zip } from '../codata';
import { mu, nu } from '../ast';
import { bool, fun, nat } from '../../04-adt/ast';

function apply(fn: string, arg: string): Call {
  return { kind: 'apply', fn, arg: { name: arg } };
}

describe('05 size-change termination', () => {
  it('accepts len-style recursion', () => {
    const len: Fun = {
      name: 'len',
      param: 'xs',
      body: apply('len', 'rest'),
    };
    expect(decidesTermination([len])).toBe(true);
  });

  it('rejects apparent non-decrease', () => {
    // len called with same arg each step would loop.
    const len: Fun = {
      name: 'len',
      param: 'xs',
      body: apply('len', 'xs'),
    };
    expect(decidesTermination([len])).toBe(false);
  });
});

describe('05 codata', () => {
  it('take(n, stream) yields the first n elements', () => {
    expect(take(5, fromArray([1, 2, 3, 4, 5, 6]))).toEqual([1, 2, 3, 4, 5]);
  });

  it('zip pairs elements', () => {
    const a = fromArray(['a', 'b']);
    const b = fromArray([1, 2]);
    const head = zip(a, b).head();
    expect(head).toEqual(['a', 1]);
  });
});

describe('05 mu / nu', () => {
  it('renders recursive types', () => {
    expect(mu('α', nat).kind).toBe('mu');
    expect(nu('α', fun(bool, nat)).kind).toBe('nu');
  });
});
