/**
 * Shared `QueryClient` factory.
 *
 * Defaults chosen for a learning project:
 *  - `staleTime: 30s` — a balance between freshness and re-fetching.
 *  - `retry: 1` — the mock API fails fast, so a single retry is enough.
 *  - `refetchOnWindowFocus: false` — keep the demo quiet.
 */
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
