/**
 * HeavyChart — fake chart with intentionally expensive render.
 *
 * Lives in its own file so `React.lazy` splits it into a separate chunk.
 * The expensive computation mimics a real chart: a long render path that
 * the chunk boundary hides behind a Suspense fallback.
 */
import { useMemo } from 'react';

function fib(n: number): number {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

export function HeavyChart() {
  const data = useMemo(() => {
    // A slow computation the optimiser is happy to cache.
    return Array.from({ length: 12 }, (_, i) => fib(i + 20));
  }, []);

  return (
    <div>
      <p>HeavyChart mounted. cached fib values:</p>
      <ul>
        {data.map((v, i) => (
          <li key={i}>
            fib({i + 20}) = <code>{v}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
