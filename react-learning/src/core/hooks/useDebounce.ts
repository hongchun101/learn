/**
 * useDebounce — return a value that updates only after `delay` ms of inactivity.
 *
 * Use it for inputs that drive expensive work (search, autosave, validation).
 * Without this, every keystroke triggers a fresh query / re-render / etc.
 */
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
