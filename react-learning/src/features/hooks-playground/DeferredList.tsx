/**
 * DeferredList — `useDeferredValue` + `useTransition` working together.
 *
 * The input drives two derivations:
 *  - "fast" — an eagerly-updated string the input mirrors.
 *  - "deferred" — the same string held back until React's scheduler has
 *    finished urgent work.
 *  - "expensive" — a derivation that filters a 10k-item list. Wrapping the
 *    setState that triggers it in `startTransition` makes it interruptible
 *    and lower priority: typing stays smooth even on a slow CPU.
 */
import { useDeferredValue, useMemo, useState, useTransition } from 'react';
import { Card, DemoArea } from '@core/components/Card';

const SAMPLE = Array.from({ length: 10_000 }, (_, i) => `item ${i.toString().padStart(4, '0')}`);

function expensiveFilter(query: string): string[] {
  // Make it intentionally slow: O(n) on 10k items with a substring scan
  // and a tiny bit of work per item.
  const q = query.toLowerCase();
  const out: string[] = [];
  for (let i = 0; i < SAMPLE.length; i += 1) {
    const v = SAMPLE[i] ?? '';
    if (v.toLowerCase().includes(q)) out.push(v);
  }
  return out;
}

export function DeferredList() {
  const [query, setQuery] = useState('');
  const [committed, setCommitted] = useState('');
  const [isPending, startTransition] = useTransition();
  const deferred = useDeferredValue(query);

  const matches = useMemo(() => expensiveFilter(deferred), [deferred]);

  return (
    <Card
      title="useDeferredValue + useTransition"
      description="Filtering 10k items stays responsive while typing."
    >
      <DemoArea>
        <input
          aria-label="filter"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            startTransition(() => setCommitted(v));
          }}
          placeholder="type to filter…"
          style={{ width: '100%' }}
        />
        <p style={{ margin: '8px 0 0' }}>
          urgent query: <code>{query || '∅'}</code> · committed: <code>{committed || '∅'}</code> ·
          pending: <strong>{String(isPending)}</strong>
        </p>
        <p style={{ margin: '4px 0' }}>
          matches: <code>{matches.length}</code>
        </p>
      </DemoArea>
    </Card>
  );
}
