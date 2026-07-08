/**
 * useMediaQuery — track a CSS media query string and return whether it matches.
 *
 * SSR-safe: returns `false` when `window.matchMedia` is unavailable. Uses the
 * modern `addEventListener('change', ...)` API; falls back to the deprecated
 * `addListener` for very old browsers (kept for completeness, not exercised).
 */
import { useEffect, useState } from 'react';

const QUERY_NO_MATCH = false;

function readMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return QUERY_NO_MATCH;
  }
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => readMatch(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
