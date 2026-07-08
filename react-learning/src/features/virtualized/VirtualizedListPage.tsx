/**
 * VirtualizedListPage — exercises the windowed list with 100k rows.
 *
 * Open the devtools "Elements" tab; you'll see only the visible items
 * are mounted in the DOM.
 */
import { useMemo } from 'react';
import { Card, DemoArea } from '@core/components/Card';
import { VirtualizedList } from './VirtualizedList';

const ROWS = 100_000;
const ITEMS = Array.from({ length: ROWS }, (_, i) => `row ${i.toString().padStart(6, '0')}`);

export function VirtualizedListPage() {
  const items = useMemo(() => ITEMS, []);
  return (
    <Card
      title="Virtualized list"
      description={`${ROWS.toLocaleString()} rows, only ~30 mounted at any time.`}
    >
      <DemoArea>
        <VirtualizedList
          items={items}
          itemHeight={28}
          height={320}
          renderItem={(label) => <span>{label}</span>}
        />
      </DemoArea>
    </Card>
  );
}
