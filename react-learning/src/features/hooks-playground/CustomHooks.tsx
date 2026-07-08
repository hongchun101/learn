/**
 * CustomHooks — exercises every custom hook in the library.
 *
 * The card lays out a tiny sandbox: type into the debounced search,
 * watch the throttled counter, see the localStorage-backed toggle survive
 * a reload, watch the intersection observer flag flip on scroll.
 */
import { useEffect, useState } from 'react';
import { Card, DemoArea, Row } from '@core/components/Card';
import {
  useDebounce,
  useInView,
  useLocalStorage,
  useThrottle,
  useToggle,
  useWhyDidYouUpdate,
} from '@core/hooks';

export function CustomHooksShowcase() {
  const [text, setText] = useState('');
  const debounced = useDebounce(text, 300);
  const throttled = useThrottle(text, 500);

  const [stored, setStored, removeStored] = useLocalStorage<string>('rl.persisted', '');
  const [flag, toggleFlag] = useToggle(false);
  useWhyDidYouUpdate('CustomHooksShowcase', { text, debounced, throttled, stored, flag });

  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.5, triggerOnce: false });
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <Card title="Custom hooks" description="Debounce · Throttle · LocalStorage · Toggle · InView">
      <DemoArea>
        <input
          aria-label="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="type…"
          style={{ width: '100%' }}
        />
        <p style={{ margin: '8px 0 0' }}>
          text: <code>{text}</code> · debounced (300ms): <code>{debounced}</code> · throttled (500ms):{' '}
          <code>{throttled}</code>
        </p>
      </DemoArea>
      <Row>
        <label>
          localStorage:
          <input
            value={stored}
            onChange={(e) => setStored(e.target.value)}
            placeholder="survives reload"
            style={{ marginLeft: 6 }}
          />
        </label>
        <button onClick={removeStored}>clear</button>
        <button onClick={toggleFlag}>toggle ({String(flag)})</button>
      </Row>
      <DemoArea>
        <div
          ref={ref as unknown as React.Ref<HTMLDivElement>}
          data-testid="observer-target"
        >
          scroll to me (threshold 0.5). in view? <strong>{String(inView)}</strong>
        </div>
        <p style={{ marginTop: 8 }}>scrollY: {scrollY}px</p>
      </DemoArea>
    </Card>
  );
}
