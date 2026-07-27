// 类型类的字典传递编码。

export interface Show<A> {
  show: (a: A) => string;
}

export interface Eq<A> {
  eq: (a: A, b: A) => boolean;
}

export const showString: Show<string> = { show: (s) => s };
export const showNumber: Show<number> = { show: (n) => String(n) };
export const eqNumber: Eq<number> = { eq: (a, b) => a === b };

/** `showList` —— 递归地使用 Show 字典。 */
export const showList =
  <A>(S: Show<A>) =>
  (xs: ReadonlyArray<A>): string =>
    `[${xs.map(S.show).join(', ')}]`;

export const compare = <A>(E: Eq<A>) => (a: A, b: A) => E.eq(a, b);
