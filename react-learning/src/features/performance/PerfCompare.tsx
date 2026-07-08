/**
 * PerfCompare — demonstrates `React.memo`, `useMemo`, and `useCallback`.
 *
 * The page holds a counter that updates a parent. A child component is
 * rendered three times in different shapes:
 *  1. un-memoised — re-renders on every parent render
 *  2. memoised (shallow) — re-renders only when its props change
 *  3. memoised with stable callback — re-renders only when a derived value
 *     actually changes
 *
 * Each child logs its render count, so you can see the effect of the
 * memoisation. This is exactly the trade-off React.memo offers: skip the
 * render when props are shallow-equal.
 */
import { memo, useCallback, useMemo, useState } from 'react';
import { Card, DemoArea, Row } from '@core/components/Card';

interface ChildProps {
  label: string;
  onClick: () => void;
  data: { name: string; age: number };
}

function PlainChild({ label, onClick, data }: ChildProps) {
  // eslint-disable-next-line no-console
  console.info(`[plain] render "${label}" age=${data.age}`);
  return (
    <button onClick={onClick} type="button">
      {label} · age {data.age}
    </button>
  );
}

const MemoChild = memo(PlainChild);

export function PerfCompare() {
  const [parentCount, setParentCount] = useState(0);
  const [name, setName] = useState('ada');
  const [age, setAge] = useState(30);

  // Stable callback identity is the lever that lets React.memo skip re-renders.
  const handlePlain = (): void => {
    // eslint-disable-next-line no-console
    console.info('plain click');
  };
  const handleMemo = useCallback((): void => {
    // eslint-disable-next-line no-console
    console.info('memo click');
  }, []);

  // A new object every render would defeat React.memo's shallow comparison.
  // useMemo gives it a stable identity when its inputs are unchanged.
  const data = useMemo(() => ({ name, age }), [name, age]);
  const inlineData = { name, age };

  return (
    <Card
      title="memo · useMemo · useCallback"
      description={`parent render #${parentCount} — open devtools console to see child renders`}
    >
      <Row>
        <button onClick={() => setParentCount((n) => n + 1)}>bump parent</button>
        <label>
          name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ marginLeft: 6 }} />
        </label>
        <label>
          age
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
            style={{ marginLeft: 6 }}
          />
        </label>
      </Row>
      <DemoArea>
        <p>Plain child (no memo, inline data, inline callback): re-renders every time.</p>
        <PlainChild label="plain" onClick={handlePlain} data={inlineData} />
        <hr />
        <p>
          Memo child (memo + stable callback + useMemo data): re-renders only when
          <code> name </code> or <code>age</code> changes.
        </p>
        <MemoChild label="memo" onClick={handleMemo} data={data} />
      </DemoArea>
    </Card>
  );
}
