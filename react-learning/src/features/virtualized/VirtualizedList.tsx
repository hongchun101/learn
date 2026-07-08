/**
 * VirtualizedList — render only the items that are visible inside the
 * scroll viewport.
 *
 * This is a *manual* implementation of the "windowing" pattern. The math
 * is the same one `react-window` and `react-virtual` use, just with more
 * surface area exposed so the technique is visible:
 *  1. Track `scrollTop`.
 *  2. Compute the first / last visible index from item height × overscan.
 *  3. Render an offset container (top padding = startIndex * itemHeight).
 *  4. Translate the visible slice into absolute positions.
 */
import { useEffect, useRef, useState } from 'react';
import { useThrottle } from '@core/hooks';

export interface VirtualizedListProps<T> {
  items: ReadonlyArray<T>;
  itemHeight: number;
  height: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function VirtualizedList<T>({
  items,
  itemHeight,
  height,
  overscan = 8,
  renderItem,
}: VirtualizedListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Throttle scroll-driven re-renders so a fast scroll doesn't queue a render
  // for every event. (60fps is fine too; this is just to show the pattern.)
  const throttled = useThrottle(scrollTop, 16);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const total = items.length * itemHeight;
  const start = Math.max(0, Math.floor(throttled / itemHeight) - overscan);
  const visibleCount = Math.ceil(height / itemHeight) + overscan * 2;
  const end = Math.min(items.length, start + visibleCount);
  const offsetY = start * itemHeight;

  return (
    <div
      ref={scrollRef}
      style={{
        height,
        overflowY: 'auto',
        position: 'relative',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <div style={{ height: total, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
          {items.slice(start, end).map((item, i) => (
            <div
              key={start + i}
              style={{
                height: itemHeight,
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              {renderItem(item, start + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
