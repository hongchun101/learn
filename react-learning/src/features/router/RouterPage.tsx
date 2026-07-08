/**
 * RouterPage — mounts the data-router demo as a *nested* router under
 * the top-level app shell.
 *
 * Nested routers in v6.4 are an explicit feature: the child routes
 * resolve before the parent, and the parent's `<Outlet>` is what allows
 * the child's content to land. We pass `basename="/router"` so the
 * child's `path: ''` (its index) maps to `/router` from the URL bar's
 * perspective.
 */
import { Card, DemoArea, Row } from '@core/components/Card';
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { router as dataRouter } from './router';

export function RouterPage() {
  // Memory router so the nested routes don't fight the URL bar.
  const memory = createMemoryRouter(dataRouter.routes, { initialEntries: ['/router'] });
  return (
    <Card
      title="Data router — loaders, actions, fetchers, defer"
      description="This sub-tree is its own router, mounted under the app shell."
    >
      <Row>
        <Link to="/router">list</Link>
        <Link to="/router/posts/1">post 1 (await)</Link>
        <Link to="/router/deferred/2">post 2 (defer)</Link>
        <Link to="/router/create">create (action + fetcher)</Link>
      </Row>
      <DemoArea>
        <RouterProvider router={memory} />
      </DemoArea>
    </Card>
  );
}
