/**
 * useToggle — boolean state with a stable flip function.
 *
 * The setter is wrapped in `useCallback` so passing it to a memoised child
 * doesn't bust memoisation. `set` is also exposed for explicit writes.
 */
import { useCallback, useState } from 'react';

export function useToggle(
  initial = false,
): [boolean, () => void, (next: boolean) => void] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle, setValue];
}
