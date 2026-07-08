# React Learning

A high-quality, runnable tour of advanced React (18+) and its ecosystem.
Every example is a real, type-safe component — no `any`, no `// TODO`, no
dead code. The whole app builds with `vite build`, type-checks under
`tsc --strict`, and ships a tested baseline.

## Quick start

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run typecheck    # strict TS
npm run test         # vitest
npm run build        # production build
npm run preview      # serve the production build
npm run e2e          # playwright smoke (requires `npx playwright install chromium`)
```

## What's in the box

The app is a single SPA with a sidebar that links to fifteen demo pages.
Each page is small, focused, and links back to the relevant concept in
its header comment.

### Hooks (`/`, `/performance`)
- `useState`, `useReducer` with discriminated-union actions (`Counter`).
- `useRef`, `useId`, `useImperativeHandle`, `forwardRef` (`Refs`).
- `useSyncExternalStore` against `window` (`WindowSize`).
- `useDeferredValue` + `useTransition` for low-priority updates (`DeferredList`).
- `useMemo`, `useCallback`, `React.memo` (`PerfCompare`).
- `React.lazy` + `<Suspense>` + `<ErrorBoundary>` (`LazyPage`).

### Custom hooks (`@core/hooks`)
- `useDebounce`, `useThrottle`, `useLocalStorage`, `useMediaQuery`,
  `useIntersectionObserver` (+ `useInView`), `usePrevious`, `useEvent`
  (stable callback), `useFetch` (with `AbortController`),
  `useTimeout`, `useToggle`, `useWhyDidYouUpdate`, `useRenderCount`.

### Context patterns (`@features/state/themeStore.ts`)
- `createStore` + `useStoreSelector` over `useSyncExternalStore` —
  the same pattern Zustand uses internally.
- `useTheme`, `useDensity`, `useThemeActions` — split context with
  a stable action object that doesn't re-render consumers.

### Advanced patterns
- Polarity-morphic `<Box as>` with a generic element type.
- Compound `<Tabs>` (context-driven, ARIA-correct, roving tabindex).
- `<ErrorBoundary>` class component (the only kind that catches
  render-time errors).
- `<Modal>` with portal, focus trap, restore focus, escape-to-close.
- `<Tooltip>` with portal + scroll/resize repositioning.
- Windowed list (`VirtualizedList`) for 100k rows.

### Routing & data
- React Router v6.4 **data router**: `loader`, `action`, `defer`,
  `useFetcher`, `<Await>`, nested routing.
- Forms: controlled, uncontrolled, `react-hook-form` + `zod` schema.
- Server state: TanStack Query with a mock API and a mutation that
  invalidates the cache.
- Client state: Zustand with `persist` middleware.
- Redux Toolkit: slice + thunk + RTK Query.

### Ecosystem
- **Styling**: Tailwind utility classes, CSS Modules, and a small
  tagged-template CSS-in-JS helper.
- **i18n**: `react-i18next` with English + Chinese, pluralisation,
  language switcher.
- **Animation**: `framer-motion` (AnimatePresence, layout, whileHover).
- **Accessibility**: ARIA-correct tabs, focus trap in the modal,
  `aria-describedby` tooltip, keyboard roving tabindex.

### Testing
- 5 unit/integration test files (9 cases) using Vitest + Testing
  Library + user-event.
- 1 Playwright e2e smoke covering navigation + i18n switch + counter
  interaction.

## Layout

```
src/
  core/
    components/   # Card, Box, Tabs, Modal, Tooltip, AppShell, css helper
    hooks/        # 13 reusable hooks
    utils/        # cn, createStore, queryClient
  features/
    hooks-playground/  # Counter, DeferredList, Refs, WindowSize, CustomHooks
    performance/       # LazyPage, PerfCompare, HeavyChart
    error-boundary/    # ErrorBoundary + demo page
    polymorphic/       # Box demo
    compound/          # Tabs demo
    virtualized/       # VirtualizedList demo
    router/            # Data-router demo (nested memory router)
    forms/             # Controlled/uncontrolled/RHF+Zod
    state/             # Zustand, Redux Toolkit, RTK Query, theme store
    server-state/      # TanStack Query
    styling/           # Tailwind + CSS Modules + CSS-in-JS
    i18n/              # react-i18next, en + zh
    animation/         # framer-motion
    a11y/              # Modal + Tooltip
  mocks/api.ts     # in-process API
  styles/          # global tokens + Tailwind directives
tests/             # vitest setup
e2e/               # playwright smoke
```

## Notes

- TypeScript strict mode is on. `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride` are all enabled.
- ESLint config covers `@typescript-eslint`, `react-hooks`, and
  `react-refresh`.
- The data-router demo uses a *memory* router nested under the app
  shell so its internal navigation doesn't fight the URL bar.
