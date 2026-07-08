/**
 * useWhyDidYouUpdate — log which prop changed between renders.
 *
 * Pure dev tool. Wires up to nothing in production, so the cost is a single
 * object key check per render. Drop it in to diagnose why a memoised child
 * keeps re-rendering.
 */
import { useEffect, useRef } from 'react';

type Props = Record<string, unknown>;

export function useWhyDidYouUpdate(componentName: string, props: Props): void {
  const previous = useRef<Props | null>(null);

  useEffect(() => {
    if (previous.current === null) {
      previous.current = props;
      return;
    }
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(props)) {
      if (previous.current[key] !== props[key]) {
        changed[key] = { from: previous.current[key], to: props[key] };
      }
    }
    if (Object.keys(changed).length > 0) {
      console.info(`[why-update] ${componentName}`, changed);
    }
    previous.current = props;
  });
}
