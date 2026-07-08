/**
 * useRenderCount — dev hook that counts how many times a component rendered.
 *
 * Reads `useRef` after a render-increment, so the count reflects the current
 * render. Cheap and useful when optimising with `memo` and `useCallback`.
 */
import { useRef } from 'react';

export function useRenderCount(componentName = 'Component'): number {
  const count = useRef(0);
  count.current += 1;
  // The label is included for clarity in DevTools; we don't have access to a
  // stable key, but `useDebugValue` would be the React-blessed way.
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[render] ${componentName} #${count.current}`);
  }
  return count.current;
}
