/**
 * useLocalStorage — synchronise state with `window.localStorage`.
 *
 * Why this shape:
 *  - Returns a `value / setValue` pair, exactly like `useState`, so callers can
 *    swap it in one-for-one. Callers that want more granular updates can pass
 *    a functional updater.
 *  - Lazily reads the initial value from storage. SSR-safe: it bails out
 *    when `window` is undefined.
 *  - Writes are JSON-serialised. We catch the `QuotaExceededError` and other
 *    write failures rather than letting them bubble — UI should keep working
 *    even if storage is unavailable (private mode, full disk, etc.).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type Updater<T> = T | ((prev: T) => T);

function readFromStorage<T>(key: string, initial: T): T {
  if (typeof window === 'undefined') return initial;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return initial;
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
): [T, (value: Updater<T>) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    const initial = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    return readFromStorage(key, initial);
  });

  // Keep a ref to the key so writes that happen before the key prop changes
  // (e.g. inside effects) still target the right slot. Without this, a stale
  // closure could write to the previous key.
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const set = useCallback((next: Updater<T>) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      try {
        window.localStorage.setItem(keyRef.current, JSON.stringify(resolved));
      } catch (err) {
        console.warn(`useLocalStorage: failed to persist "${keyRef.current}"`, err);
      }
      return resolved;
    });
  }, []);

  const remove = useCallback(() => {
    try {
      window.localStorage.removeItem(keyRef.current);
    } catch {
      /* ignore */
    }
    setValue(typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue);
  }, [initialValue]);

  // Sync across tabs / windows via the native `storage` event. Listening on
  // `window` (not the current `document`) is required — `storage` does not fire
  // in the tab that performed the write.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== key) return;
      if (e.newValue === null) {
        setValue(
          typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue,
        );
        return;
      }
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        /* corrupt entry; ignore */
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, initialValue]);

  return [value, set, remove];
}
