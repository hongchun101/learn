/**
 * useEvent — return a stable callback whose body always sees the latest props/state.
 *
 * React's official proposal of the same name. The problem it solves: you want
 * to pass a callback down that reads fresh state (e.g. inside `setInterval`,
 * `addEventListener`, or `useEffect` with stable deps), but you don't want
 * the callback identity to change on every render — that would re-subscribe
 * everything.
 *
 * Implementation: stash the latest function in a ref, and return a ref-backed
 * wrapper that always calls the latest one. Identity is stable.
 */
import { useCallback, useInsertionEffect, useRef } from 'react';

export function useEvent<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  const ref = useRef(fn);
  // `useInsertionEffect` runs before any DOM mutation, so even an effect
  // scheduled by the same render sees the freshest callback.
  useInsertionEffect(() => {
    ref.current = fn;
  }, [fn]);

  return useCallback((...args: TArgs) => ref.current(...args), []);
}
