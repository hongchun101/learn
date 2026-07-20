// Dictionary-passing encoding of type classes.

export interface Show<A> {
  show: (a: A) => string;
}

export interface Eq<A> {
  eq: (a: A, b: A) => boolean;
}

export const showString: Show<string> = { show: (s) => s };
export const showNumber: Show<number> = { show: (n) => String(n) };
export const eqNumber: Eq<number> = { eq: (a, b) => a === b };

/** `showList` — uses the Show dictionary recursively. */
export const showList =
  <A>(S: Show<A>) =>
  (xs: ReadonlyArray<A>): string =>
    `[${xs.map(S.show).join(', ')}]`;

export const compare = <A>(E: Eq<A>) => (a: A, b: A) => E.eq(a, b);
