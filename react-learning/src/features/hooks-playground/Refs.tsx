/**
 * Refs — `useRef`, `useId`, `forwardRef` + `useImperativeHandle`.
 *
 * - `useRef` for a mutable handle that doesn't trigger re-renders.
 * - `useId` for an SSR-safe, hydration-stable id (label/input pairing).
 * - `useImperativeHandle` for declaring a *narrowed* imperative API:
 *   parents see only `focus()` and `getValue()`, not the raw DOM node.
 */
import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react';
import { Card, DemoArea, Row } from '@core/components/Card';

export interface ImperativeInputHandle {
  focus: () => void;
  getValue: () => string;
  clear: () => void;
}

interface ImperativeInputProps {
  label: string;
}

const ImperativeInput = forwardRef<ImperativeInputHandle, ImperativeInputProps>(
  ({ label }, ref) => {
    const id = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [, force] = useState(0);

    useImperativeHandle(
      ref,
      (): ImperativeInputHandle => ({
        focus: () => inputRef.current?.focus(),
        getValue: () => inputRef.current?.value ?? '',
        clear: () => {
          if (inputRef.current) inputRef.current.value = '';
          force((n) => n + 1);
        },
      }),
      [],
    );

    return (
      <div>
        <label htmlFor={id}>{label}</label>{' '}
        <input id={id} ref={inputRef} type="text" placeholder="type something" />
      </div>
    );
  },
);
ImperativeInput.displayName = 'ImperativeInput';

export function RefsDemo() {
  const ref = useRef<ImperativeInputHandle>(null);
  const id = useId();

  return (
    <Card title="useRef · useId · useImperativeHandle">
      <DemoArea>
        <p style={{ marginTop: 0 }}>
          instance id: <code>{id}</code>
        </p>
        <ImperativeInput ref={ref} label="Controlled-from-parent" />
      </DemoArea>
      <Row>
        <button onClick={() => ref.current?.focus()}>focus</button>
        <button
          onClick={() => {
            const v = ref.current?.getValue() ?? '';
            window.alert(`value = "${v}"`);
          }}
        >
          read value
        </button>
        <button onClick={() => ref.current?.clear()}>clear</button>
      </Row>
    </Card>
  );
}
