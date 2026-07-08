/**
 * createStore — a minimal observable store factory.
 *
 * Why this exists:
 *  - The default `React.useSyncExternalStore` API takes `subscribe` and
 *    `getSnapshot` as raw functions. When you wire the same store into many
 *    components, you usually want to *select* a slice and only re-render when
 *    that slice changes. Encapsulating the subscription + equality logic
 *    removes the boilerplate at every callsite.
 *  - This is the same pattern Zustand uses internally. It's worth knowing
 *    because the implementation is ~30 lines and you'll never forget the
 *    teardown-on-subscribe dance again.
 */
import { useDebugValue, useRef, useSyncExternalStore } from 'react';

export type Listener = () => void;
export type Selector<T, S> = (state: T) => S;
export type EqualityFn<S> = (a: S, b: S) => boolean;

const identityEq = <S,>(a: S, b: S): boolean => a === b;

export interface Store<T> {
  getState: () => T;
  setState: (partial: Partial<T> | ((s: T) => Partial<T>)) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();

  const getState = (): T => state;

  const setState: Store<T>['setState'] = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = Object.assign({}, state, next);
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
}

/**
 * useStoreSelector — subscribe to a store and select a slice.
 *
 * `selector` is run on every store update; `equality` decides whether to
 * trigger a re-render. The selector's return value is also surfaced via
 * React DevTools (`useDebugValue`).
 */
export function useStoreSelector<T, S>(
  store: Store<T>,
  selector: Selector<T, S>,
  equality: EqualityFn<S> = identityEq,
): S {
  const subscribe = (listener: Listener): (() => void) => store.subscribe(listener);
  const getSnapshot = (): S => selector(store.getState());
  const slice = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // useSyncExternalStore runs the snapshot on every render. We hold the
  // last-equal slice in a ref so callers that pass a custom equality fn
  // (e.g. shallow) only see a new reference when the slice actually
  // changes. With the default identity equality the ref tracks the slice
  // exactly.
  const lastRef = useRef<S>(slice);
  if (!equality(lastRef.current, slice)) {
    lastRef.current = slice;
  }
  useDebugValue(lastRef.current);
  return lastRef.current;
}
