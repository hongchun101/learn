/**
 * Router — `createBrowserRouter` with loaders, actions, fetchers, and
 * deferred data.
 *
 *  - `loader`: runs before the route renders. Throw a `Response` to
 *    trigger an error boundary; return data for the component to read via
 *    `useLoaderData()`.
 *  - `action`: runs on form submissions targeting this route's `action`
 *    URL. Useful for mutations without leaving the data-router model.
 *  - `defer`: returns a mix of resolved and unresolved values. Awaited
 *    parts render normally; pending parts need a `<Await>` boundary.
 *  - `useFetcher`: a "side-channel" form submission that doesn't navigate.
 */
import { Suspense } from 'react';
import {
  Await,
  Outlet,
  createBrowserRouter,
  defer,
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from 'react-router-dom';
import { mockApi } from '@/mocks/api';
import type { Author, Post } from '@/mocks/api';

function PostsList() {
  const posts = useLoaderData() as Post[];
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}>
          <a href={`/router/posts/${p.id}`}>{p.title}</a>
        </li>
      ))}
    </ul>
  );
}

function PostDetail() {
  const { post, author } = useLoaderData() as { post: Post; author: Author };
  const navigation = useNavigation();
  const isRevalidating = navigation.state === 'loading';

  return (
    <article>
      <h2>{post.title}</h2>
      <p>{post.body}</p>
      <small style={{ color: 'var(--color-fg-muted)' }}>
        {isRevalidating ? 'revalidating…' : `by ${author.name}`}
      </small>
    </article>
  );
}

/**
 * Defers the post body so it streams, and the author lookup runs in
 * parallel. `Await` suspends until each piece resolves.
 */
function PostDetailDeferred() {
  const data = useLoaderData() as { post: Post; authorPromise: Promise<Author> };
  return (
    <article>
      <h2>{data.post.title}</h2>
      <p>{data.post.body}</p>
      <Suspense fallback={<em>loading author…</em>}>
        <Await resolve={data.authorPromise}>
          {(author) => <small style={{ color: 'var(--color-fg-muted)' }}>by {author.name}</small>}
        </Await>
      </Suspense>
    </article>
  );
}

function CreatePost() {
  const actionData = useActionData() as { ok: boolean; id?: number; error?: string } | undefined;
  const fetcher = useFetcher<{ ok: boolean; id: number }>();
  return (
    <div>
      <h3>Create post</h3>
      <p>
        Two flavours on this page: a navigable form (below) and a
        side-channel form that uses <code>fetcher.Form</code> to post
        without leaving the page.
      </p>
      <h4>navigable</h4>
      <form method="post">
        <input name="title" placeholder="title" />
        <button type="submit">submit (navigates)</button>
      </form>
      {actionData?.ok ? <p>created #{actionData.id}</p> : null}
      {actionData?.error ? <p style={{ color: 'var(--color-danger)' }}>{actionData.error}</p> : null}

      <h4>side-channel</h4>
      <fetcher.Form method="post" action="/router/create">
        <input name="title" placeholder="title" />
        <button type="submit">submit (no nav)</button>
      </fetcher.Form>
      {fetcher.data?.ok ? <p>created #{fetcher.data.id} (via fetcher)</p> : null}
      {fetcher.state === 'submitting' ? <p>submitting…</p> : null}
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/router',
    element: <Outlet />,
    children: [
      {
        index: true,
        element: <PostsList />,
        loader: () => mockApi.listPosts(),
      },
      {
        path: 'posts/:id',
        element: <PostDetail />,
        loader: async ({ params }) => {
          const id = Number(params.id);
          if (Number.isNaN(id)) throw new Response('bad id', { status: 400 });
          const post = await mockApi.getPost(id);
          const author = await mockApi.getAuthor(post.authorId);
          return { post, author };
        },
      },
      {
        path: 'deferred/:id',
        element: <PostDetailDeferred />,
        loader: async ({ params }) => {
          const id = Number(params.id);
          if (Number.isNaN(id)) throw new Response('bad id', { status: 400 });
          const post = await mockApi.getPost(id);
          return defer({ post, authorPromise: mockApi.getAuthor(post.authorId) });
        },
      },
      {
        path: 'create',
        element: <CreatePost />,
        action: async ({ request }) => {
          const form = await request.formData();
          const title = String(form.get('title') ?? '').trim();
          if (title.length === 0) {
            return { ok: false, error: 'title is required' };
          }
          return { ok: true, id: Math.floor(Math.random() * 1000) };
        },
        loader: () => redirect('/router'),
      },
    ],
  },
]);
