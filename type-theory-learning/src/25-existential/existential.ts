// 存在类型，模拟为隐藏内部类型的数据类。

export interface Exists<P extends ReadonlyArray<unknown>, R> {
  readonly project: (...args: P) => R;
}

export const pack = <P extends ReadonlyArray<unknown>, R>(
  f: (...args: P) => R,
): Exists<P, R> => ({ project: f });

export const use = <P extends ReadonlyArray<unknown>, R>(e: Exists<P, R>, ...args: P): R =>
  e.project(...args);
