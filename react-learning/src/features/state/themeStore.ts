/**
 * Theme store — a global store built from `createStore` + a custom
 * `useStoreSelector` hook.
 *
 * The point of this example: the **provider** splits the value into
 * separate contexts (state, actions). Components that only call
 * `useThemeActions` never re-render when the theme value flips, because
 * the actions context is stable.
 *
 * The selector hook is built on `useSyncExternalStore`, so concurrent
 * React features (transitions, suspense) are correctly handled.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { createStore } from '@core/utils/createStore';
import type { Store } from '@core/utils/createStore';

export type Theme = 'light' | 'dark';

export interface ThemeState {
  theme: Theme;
  density: 'comfortable' | 'compact';
}

const initial: ThemeState = { theme: 'dark', density: 'comfortable' };

const store: Store<ThemeState> = createStore(initial);

const subscribers = new Set<() => void>();

const subscribe = (cb: () => void): (() => void) => {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
};

const getState = (): ThemeState => store.getState();

function notify(): void {
  subscribers.forEach((cb) => cb());
}

export function setTheme(theme: Theme): void {
  store.setState({ theme });
  notify();
}

export function setDensity(density: ThemeState['density']): void {
  store.setState({ density });
  notify();
}

export function useThemeSelector<R>(selector: (state: ThemeState) => R): R {
  return useSyncExternalStore(subscribe, () => selector(getState()), () => selector(initial));
}

export const useTheme = (): ThemeState['theme'] => useThemeSelector((s) => s.theme);
export const useDensity = (): ThemeState['density'] => useThemeSelector((s) => s.density);

export interface ThemeActions {
  setTheme: (t: Theme) => void;
  setDensity: (d: ThemeState['density']) => void;
  toggle: () => void;
}

const stableActions: ThemeActions = {
  setTheme,
  setDensity,
  toggle: () => setTheme(getState().theme === 'dark' ? 'light' : 'dark'),
};

/**
 * useThemeActions — returns the same object reference across renders.
 *
 * Components consuming only the actions never re-render when the state
 * changes, because the value is constant. This is the "split contexts"
 * pattern: separate the *value* (which changes) from the *dispatchers*
 * (which don't).
 */
export function useThemeActions(): ThemeActions {
  return useMemo(() => stableActions, []);
}
