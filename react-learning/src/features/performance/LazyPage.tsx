/**
 * LazyPage — `React.lazy` + `<Suspense>` + error boundary.
 *
 * Three patterns in one component:
 *  - `React.lazy` code-splits a component into its own chunk.
 *  - `<Suspense fallback>` lets the rest of the UI render while the chunk
 *    downloads.
 *  - The chunk itself throws a promise (its `import()`). Suspense "catches"
 *    the throw and renders the fallback; once the chunk resolves, the
 *    children render in place.
 */
import { lazy, Suspense, useState } from 'react';
import { Card, DemoArea, Row } from '@core/components/Card';
import { ErrorBoundary } from '@features/error-boundary/ErrorBoundary';

const HeavyChart = lazy(() => import('./HeavyChart').then((m) => ({ default: m.HeavyChart })));

export function LazyPage() {
  const [show, setShow] = useState(false);

  return (
    <Card
      title="Code splitting — React.lazy + Suspense"
      description="The chart chunk is fetched only after the user opts in."
    >
      <Row>
        <button onClick={() => setShow(true)}>load chart</button>
        <button onClick={() => setShow(false)}>unmount</button>
      </Row>
      <DemoArea>
        <ErrorBoundary>
          <Suspense fallback={<p>loading chart chunk…</p>}>
            {show ? <HeavyChart /> : <p>chart not loaded yet.</p>}
          </Suspense>
        </ErrorBoundary>
      </DemoArea>
    </Card>
  );
}
