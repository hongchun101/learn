// @ts-nocheck
// Lightweight call/cc + reset/shift via direct CPS-style runtimes.
// (Real engine integration would require first-class continuations.)

export type Cc<A> = (k: (a: A) => void) => void;

export const callcc = <A, B>(f: (exit: (a: A) => void) => Cc<B>): Cc<B> =>
  (k) => {
    let done = false;
    const exit = (a: A): void => {
      if (done) return;
      done = true;
      k(a);
    };
    f(exit)((b: B) => {
      if (!done) {
        done = true;
        k(b);
      }
    });
  };

export const reset = <A>(m: Cc<A>): A => {
  let result: A | undefined;
  let done = false;
  m((a) => {
    if (done) return;
    result = a;
    done = true;
  });
  if (!done || result === undefined) throw new Error('reset: nothing');
  return result;
};

/** `shift k. body` — captures the continuation up to the nearest reset. */
export const shift = <A, B>(f: (k: Cc<A>) => Cc<B>): Cc<A> =>
  (k) =>
    f(k)((b: B) => k(b));
