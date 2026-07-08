/**
 * ServerStatePage — TanStack Query in action.
 *
 * The query key is a tuple: `['posts']`. Cache invalidation is then a
 * matter of calling `queryClient.invalidateQueries({ queryKey: ['posts'] })`.
 * That's the lever every server-state library exposes; TanStack just
 * makes it explicit.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, DemoArea, Row } from '@core/components/Card';
import { mockApi } from '@/mocks/api';
import type { Post } from '@/mocks/api';

const POSTS_KEY = ['posts'] as const;

export function ServerStatePage() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: POSTS_KEY,
    queryFn: () => mockApi.listPosts(),
  });

  const invalidate = useMutation({
    mutationFn: async (title: string) => {
      // Pretend to create the post; in real code this would call a real API.
      await new Promise((r) => setTimeout(r, 200));
      return { id: Math.floor(Math.random() * 1000), title } as Post;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: POSTS_KEY });
    },
  });

  return (
    <Card
      title="Server state — TanStack Query"
      description="Cached by query key, with a mutation that invalidates the cache."
    >
      <DemoArea>
        {list.isPending ? <p>loading…</p> : null}
        {list.isError ? <p style={{ color: 'var(--color-danger)' }}>error: {String(list.error)}</p> : null}
        {list.data ? (
          <ul>
            {list.data.map((p) => (
              <li key={p.id}>
                #{p.id} {p.title}
              </li>
            ))}
          </ul>
        ) : null}
        <p style={{ color: 'var(--color-fg-muted)' }}>
          dataUpdatedAt: {list.dataUpdatedAt ? new Date(list.dataUpdatedAt).toLocaleTimeString() : '—'}
        </p>
      </DemoArea>
      <Row>
        <button onClick={() => list.refetch()}>refetch</button>
        <button
          disabled={invalidate.isPending}
          onClick={() => invalidate.mutate(`new post ${Date.now()}`)}
        >
          {invalidate.isPending ? 'saving…' : 'create post (invalidates)'}
        </button>
      </Row>
    </Card>
  );
}
