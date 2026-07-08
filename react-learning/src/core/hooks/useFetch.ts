/**
 * useFetch — minimal data-fetching hook built on `AbortController`.
 *
 * For real applications, prefer TanStack Query (server-state cache, dedup,
 * retries, suspense integration). This is the minimum a hand-rolled hook
 * needs to be safe:
 *  - Cancels in-flight requests when the component unmounts or the URL
 *    changes (avoids `Can't perform a state update on an unmounted component`).
 *  - Distinguishes "loading" from "success" from "error" with a tagged union.
 *  - Lets callers re-run via `refetch()`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

export interface UseFetchResult<T> {
  state: FetchState<T>;
  refetch: () => void;
}

export function useFetch<T>(url: string | null): UseFetchResult<T> {
  const [state, setState] = useState<FetchState<T>>({ status: 'idle' });
  const [tick, setTick] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (url === null) {
      setState({ status: 'idle' });
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'loading' });

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) });
      });

    return () => controller.abort();
  }, [url, tick]);

  return { state, refetch };
}
