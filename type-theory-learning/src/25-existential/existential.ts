// Existential types modelled as a data-class hiding the hidden type.

export interface Exists<P extends ReadonlyArray<unknown>, R> {
  readonly project: (...args: P) => R;
}

export const pack = <P extends ReadonlyArray<unknown>, R>(
  f: (...args: P) => R,
): Exists<P, R> => ({ project: f });

export const use = <P extends ReadonlyArray<unknown>, R>(e: Exists<P, R>, ...args: P): R =>
  e.project(...args);
