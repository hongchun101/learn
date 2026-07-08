/**
 * Tabs — a compound component.
 *
 * The "compound" pattern shares state through a context that the parent
 * (`Tabs`) owns. Children (`Tabs.List`, `Tabs.Trigger`, `Tabs.Panel`)
 * consume that context.
 *
 * The win is a tidy public API: `<Tabs defaultValue="a"><Tabs.List>...
 * </Tabs.List><Tabs.Panel value="a">...</Tabs.Panel></Tabs>`. No prop
 * drilling, no render-prop chain.
 *
 * Accessibility:
 *  - `role="tablist"` on the trigger container.
 *  - `role="tab"`, `aria-selected`, `aria-controls` on each trigger.
 *  - `role="tabpanel"`, `aria-labelledby` on each panel.
 *  - Arrow-key navigation across triggers (roving tabindex).
 */
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

interface TabsContextValue {
  baseId: string;
  value: string;
  setValue: (v: string) => void;
  triggers: string[];
  registerTrigger: (v: string, el: HTMLButtonElement | null) => void;
  focusTrigger: (v: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (ctx === null) throw new Error(`${component} must be rendered inside <Tabs>`);
  return ctx;
}

export interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
}

export function Tabs({ defaultValue, value, onValueChange, children }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const [triggers, setTriggers] = useState<string[]>([]);
  const id = useId();
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());
  // Track which values have ever mounted so we can render the right
  // tabIndex even before they're registered. Updated via a ref that
  // mirrors the triggers list.
  const mounted = useRef<Set<string>>(new Set());

  const current = value ?? internal;
  const setValue = useCallback(
    (v: string) => {
      if (value === undefined) setInternal(v);
      onValueChange?.(v);
    },
    [onValueChange, value],
  );

  // Register/unregister: never call `setTriggers` on unregister because
  // React 18 strict-mode calls the ref callback twice in dev, and that
  // would loop. Instead we mirror "ever-mounted" in a ref, and the
  // ordered triggers list is derived from the map when needed.
  const registerTrigger = useCallback((v: string, el: HTMLButtonElement | null): void => {
    if (el) {
      if (!mounted.current.has(v)) {
        mounted.current.add(v);
        refs.current.set(v, el);
        setTriggers((prev) => (prev.includes(v) ? prev : [...prev, v]));
      } else {
        refs.current.set(v, el);
      }
    } else {
      refs.current.delete(v);
    }
  }, []);

  const focusTrigger = useCallback((v: string) => {
    refs.current.get(v)?.focus();
  }, []);

  const focusByOffset = useCallback(
    (offset: number) => {
      const idx = triggers.indexOf(current);
      if (idx === -1) return;
      const next = triggers[(idx + offset + triggers.length) % triggers.length];
      if (next === undefined) return;
      setValue(next);
      focusTrigger(next);
    },
    [triggers, current, setValue, focusTrigger],
  );

  const ctx: TabsContextValue = {
    baseId: id,
    value: current,
    setValue,
    triggers,
    registerTrigger,
    focusTrigger,
  };

  return (
    <TabsContext.Provider value={ctx}>
      <div
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            focusByOffset(1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            focusByOffset(-1);
          } else if (e.key === 'Home') {
            e.preventDefault();
            const first = triggers[0];
            if (first !== undefined) {
              setValue(first);
              focusTrigger(first);
            }
          } else if (e.key === 'End') {
            e.preventDefault();
            const last = triggers[triggers.length - 1];
            if (last !== undefined) {
              setValue(last);
              focusTrigger(last);
            }
          }
        }}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function List({ children }: { children: ReactNode }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)' }}>
      {children}
    </div>
  );
}

interface TriggerProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
}

function Trigger({ value, children, disabled }: TriggerProps) {
  const { baseId, value: current, setValue, registerTrigger, focusTrigger } = useTabs('Tabs.Trigger');
  const selected = value === current;
  return (
    <button
      ref={(node) => registerTrigger(value, node)}
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => setValue(value)}
      onFocus={() => focusTrigger(value)}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: selected ? '2px solid var(--color-accent)' : '2px solid transparent',
        padding: '8px 12px',
        color: selected ? 'var(--color-accent)' : 'var(--color-fg-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

interface PanelProps {
  value: string;
  children: ReactNode;
}

function Panel({ value, children }: PanelProps) {
  const { baseId, value: current } = useTabs('Tabs.Panel');
  if (value !== current) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      style={{ padding: '12px 4px' }}
    >
      {children}
    </div>
  );
}

Tabs.List = List;
Tabs.Trigger = Trigger;
Tabs.Panel = Panel;
