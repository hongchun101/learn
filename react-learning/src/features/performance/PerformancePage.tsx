/**
 * PerformancePage — aggregates the performance features.
 */
import { Card } from '@core/components/Card';
import { LazyPage } from './LazyPage';
import { PerfCompare } from './PerfCompare';

export function PerformancePage() {
  return (
    <div>
      <Card title="Performance">
        <p>
          React's reconciliation is already fast. These are the levers you reach
          for when profiling tells you a render is hot.
        </p>
      </Card>
      <LazyPage />
      <PerfCompare />
    </div>
  );
}
