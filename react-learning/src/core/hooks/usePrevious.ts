/**
 * usePrevious — capture the value from the previous render.
 *
 * The classic pattern: store the value in a ref and update it during the
 * commit phase, *after* the current render has read it. The `useEffect` body
 * runs after commit, so the ref's value when next read is the previous one.
 */
import { useEffect, useRef } from 'react';

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
