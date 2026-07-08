/**
 * useTimeout — fire a callback once after `delay` ms, with a manual reset.
 *
 * The callback is read via a ref so the timeout doesn't reschedule when the
 * caller's identity changes. The `useEffect` deps include the delay so
 * changing it re-arms the timer.
 */
import { useEffect, useRef } from 'react';
import { useEvent } from './useEvent';

export function useTimeout(callback: () => void, delay: number | null): void {
  const cb = useEvent(callback);
  const savedCallback = useRef(cb);
  savedCallback.current = cb;

  useEffect(() => {
    if (delay === null) return;
    const id = window.setTimeout(() => savedCallback.current(), delay);
    return () => window.clearTimeout(id);
  }, [delay]);
}
