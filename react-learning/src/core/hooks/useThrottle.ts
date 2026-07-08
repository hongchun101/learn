/**
 * useThrottle — return a value that updates at most once per `interval` ms.
 *
 * Unlike `useDebounce`, the trailing update fires on a schedule, not on
 * silence. Useful for high-frequency events (scroll, mouse move, resize)
 * where you want a steady cadence.
 */
import { useEffect, useRef, useState } from 'react';

export function useThrottle<T>(value: T, interval = 200): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);
  const timer = useRef<number | null>(null);
  const latestValue = useRef(value);

  latestValue.current = value;

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdate.current;

    const flush = () => {
      lastUpdate.current = Date.now();
      setThrottled(latestValue.current);
    };

    if (elapsed >= interval) {
      flush();
    } else {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, interval - elapsed);
    }

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [value, interval]);

  return throttled;
}
