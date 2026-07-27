// 高阶 kind 类型记法（在值层面为文档 / 测试建模）。

export type Kind = 'star' | { arrow: ReadonlyArray<Kind> };

export type HKT<F, A> = { readonly _F: F; readonly _A: A };

export interface BoxHKT {
  readonly _kind: 'star -> star';
  map<A, B>(box: { value: A }, f: (a: A) => B): { value: B };
}

export interface MaybeHKT {
  readonly _kind: 'star -> star';
  just<A>(a: A): { kind: 'just'; value: A };
  nothing<A>(): { kind: 'nothing' };
}

export type boxMap = 'covariant';
