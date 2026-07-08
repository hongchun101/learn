/**
 * App — the top-level React Router.
 *
 * The shape: a single `createBrowserRouter` whose `path: '/'` route is
 * the `AppShell`, with feature pages as children. The data-router demo
 * (in `features/router/router.tsx`) is mounted under `/router/*` via
 * `RouterProvider` — but only the *sub-router*. The outer router stays
 * the source of truth for navigation.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@features/error-boundary/ErrorBoundary';
import { HooksPlaygroundPage } from '@features/hooks-playground';
import { PerformancePage } from '@features/performance';
import { ErrorBoundaryPage } from '@features/error-boundary/ErrorBoundaryPage';
import { PolymorphicPage } from '@features/polymorphic';
import { CompoundPage } from '@features/compound';
import { VirtualizedListPage } from '@features/virtualized';
import { RouterPage } from '@features/router/RouterPage';
import { FormsPage } from '@features/forms';
import { ClientStatePage } from '@features/state/ClientStatePage';
import { ReduxPage } from '@features/state/redux/ReduxPage';
import { ServerStatePage } from '@features/server-state';
import { StylingPage } from '@features/styling';
import { I18nPage } from '@features/i18n';
import { AnimationPage } from '@features/animation';
import { A11yPage } from '@features/a11y';
import { AppShell } from '@core/components/AppShell';
import { createQueryClient } from '@core/utils/queryClient';
import { reduxStore } from '@features/state/redux/store';

const queryClient = createQueryClient();

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <QueryClientProvider client={queryClient}>
        <ReduxProvider store={reduxStore}>
          <AppShell />
        </ReduxProvider>
      </QueryClientProvider>
    ),
    children: [
      { index: true, element: <HooksPlaygroundPage /> },
      { path: 'performance', element: <PerformancePage /> },
      { path: 'error-boundary', element: <ErrorBoundaryPage /> },
      { path: 'polymorphic', element: <PolymorphicPage /> },
      { path: 'compound', element: <CompoundPage /> },
      { path: 'virtualized', element: <VirtualizedListPage /> },
      {
        path: 'router',
        element: <RouterPage />,
        children: [
          { index: true, element: <p>pick a route from above.</p> },
        ],
      },
      { path: 'forms', element: <FormsPage /> },
      { path: 'state', element: <ClientStatePage /> },
      { path: 'server-state', element: <ServerStatePage /> },
      { path: 'redux', element: <ReduxPage /> },
      { path: 'styling', element: <StylingPage /> },
      { path: 'i18n', element: <I18nPage /> },
      { path: 'animation', element: <AnimationPage /> },
      { path: 'a11y', element: <A11yPage /> },
    ],
    errorElement: (
      <ErrorBoundary>
        <p>something went wrong at the route level.</p>
      </ErrorBoundary>
    ),
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
