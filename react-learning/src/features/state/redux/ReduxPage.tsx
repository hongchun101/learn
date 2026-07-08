/**
 * ReduxPage — RTK Query + a slice, side by side.
 *
 * The `useGetPostsQuery` hook returns `{ data, isLoading, error, refetch }`
 * — the same shape as TanStack Query, intentionally. RTK Query is the
 * canonical answer to "where does server state go?" in the Redux world.
 */
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, DemoArea, Row } from '@core/components/Card';
import { fetchPosts } from './postsSlice';
import { useGetPostsQuery } from './postsApi';
import type { AppDispatch, RootState } from './store';

function SliceView() {
  const dispatch = useDispatch<AppDispatch>();
  const { list, status, error } = useSelector((s: RootState) => s.posts);
  useEffect(() => {
    if (status === 'idle') void dispatch(fetchPosts());
  }, [status, dispatch]);
  return (
    <div>
      <h4>Slice + thunk</h4>
      {status === 'loading' ? <p>loading…</p> : null}
      {error ? <p style={{ color: 'var(--color-danger)' }}>error: {error}</p> : null}
      <ul>
        {list.map((p) => (
          <li key={p.id}>#{p.id} {p.title}</li>
        ))}
      </ul>
      <button onClick={() => void dispatch(fetchPosts())}>refetch via thunk</button>
    </div>
  );
}

function RtkQueryView() {
  const { data, isLoading, error, refetch } = useGetPostsQuery(undefined);
  return (
    <div>
      <h4>RTK Query</h4>
      {isLoading ? <p>loading…</p> : null}
      {error ? <p style={{ color: 'var(--color-danger)' }}>error</p> : null}
      {data ? (
        <ul>
          {data.map((p) => (
            <li key={p.id}>#{p.id} {p.title}</li>
          ))}
        </ul>
      ) : null}
      <button onClick={() => refetch()}>refetch</button>
    </div>
  );
}

export function ReduxPage() {
  return (
    <Card title="Redux Toolkit + RTK Query">
      <DemoArea>
        <Row>
          <SliceView />
          <RtkQueryView />
        </Row>
      </DemoArea>
    </Card>
  );
}
