// @ts-nocheck
// 自然变换，以 TypeScript 函数的方式建模。
//
//   natural : ∀α. F<α> → G<α>
//   respect:  对所有 α,β f.    natural . F<map f>  =  G<map f> . natural

import type { BoxHKT, MaybeHKT } from './kinds';

export interface Box<A> {
  readonly value: A;
}
export interface Maybe<A> {
  readonly kind: 'just' | 'nothing';
  readonly value?: A;
}

const Box: BoxHKT = {
  _kind: 'star -> star',
  map<A, B>(box: Box<A>, f: (a: A) => B): Box<B> {
    return { value: f(box.value) };
  },
};

const Maybe: MaybeHKT = {
  _kind: 'star -> star',
  just<A>(a: A): Maybe<A> {
    return { kind: 'just', value: a };
  },
  nothing<A>(): Maybe<A> {
    return { kind: 'nothing' };
  },
};

/** 自然变换 `Box → Maybe` = `box a ↦ just a`。 */
export const boxToMaybe = <A>(b: Box<A>): Maybe<A> => Maybe.just(b.value);

export const Box_ = Box;
export const Maybe_ = Maybe;
