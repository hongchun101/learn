/**
 * ErrorBoundaryPage — a small page that demonstrates a thrown render
 * error and the recovery path.
 */
import { useState } from 'react';
import { Card, DemoArea, Row } from '@core/components/Card';
import { ErrorBoundary } from './ErrorBoundary';

function Buggy({ shouldThrow }: { shouldThrow: boolean }): JSX.Element {
  if (shouldThrow) throw new Error('intentional render error');
  return <p>rendering cleanly.</p>;
}

export function ErrorBoundaryPage() {
  const [throwIt, setThrowIt] = useState(false);
  const [key, setKey] = useState(0);

  return (
    <Card
      title="Error boundaries"
      description="Render-time exceptions are caught and the tree continues."
    >
      <Row>
        <button onClick={() => setThrowIt((v) => !v)}>
          {throwIt ? 'stop throwing' : 'throw on render'}
        </button>
        <button onClick={() => setKey((n) => n + 1)}>force remount</button>
      </Row>
      <DemoArea>
        <ErrorBoundary key={key}>
          <Buggy shouldThrow={throwIt} />
        </ErrorBoundary>
      </DemoArea>
    </Card>
  );
}
