/**
 * WindowSize — `useSyncExternalStore` reading directly from `window`.
 *
 * `useSyncExternalStore` is the React-blessed way to subscribe to any
 * mutable external source. It guarantees:
 *  - The snapshot is consistent (no tearing during concurrent renders).
 *  - Subscriptions are torn down correctly.
 *  - A `getServerSnapshot` covers SSR.
 */
import { useSyncExternalStore } from 'react';
import { Card, DemoArea } from '@core/components/Card';

function subscribe(cb: () => void): () => void {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

function getSnapshot(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

function getServerSnapshot(): { w: number; h: number } {
  return { w: 0, h: 0 };
}

export function WindowSize() {
  const { w, h } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <Card title="useSyncExternalStore — live window size">
      <DemoArea>
        viewport: <code>{w} × {h}</code>
      </DemoArea>
    </Card>
  );
}
