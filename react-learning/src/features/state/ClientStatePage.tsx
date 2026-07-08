/**
 * ClientStatePage — Zustand store driving a tiny cart.
 *
 * `useCartStore(selector)` returns a stable hook. We pull the items, the
 * add action, and the totals from the same store; selectors ensure each
 * component only re-renders when its slice changes.
 */
import { useMemo } from 'react';
import { Card, DemoArea, Row } from '@core/components/Card';
import { useCartStore } from './cartStore';

const SAMPLE = [
  { id: 1, name: 'Apples' },
  { id: 2, name: 'Pears' },
  { id: 3, name: 'Bread' },
];

export function ClientStatePage() {
  const items = useCartStore((s) => s.items);
  const add = useCartStore((s) => s.add);
  const remove = useCartStore((s) => s.remove);
  const setQty = useCartStore((s) => s.setQty);
  const clear = useCartStore((s) => s.clear);

  const total = useMemo(
    () => items.reduce((acc, x) => acc + x.qty, 0),
    [items],
  );

  return (
    <Card title="Client state — Zustand" description="Persisted to localStorage.">
      <DemoArea>
        <Row>
          {SAMPLE.map((s) => (
            <button key={s.id} onClick={() => add(s)}>
              add {s.name}
            </button>
          ))}
          <button onClick={clear}>clear</button>
        </Row>
        <p style={{ marginTop: 8 }}>cart total: <strong>{total}</strong></p>
        {items.length === 0 ? (
          <p style={{ color: 'var(--color-fg-muted)' }}>empty</p>
        ) : (
          <ul>
            {items.map((x) => (
              <li key={x.id}>
                {x.name} ·{' '}
                <input
                  type="number"
                  min={0}
                  value={x.qty}
                  onChange={(e) => setQty(x.id, Number(e.target.value))}
                  style={{ width: 60 }}
                />{' '}
                <button onClick={() => remove(x.id)}>remove</button>
              </li>
            ))}
          </ul>
        )}
      </DemoArea>
    </Card>
  );
}
