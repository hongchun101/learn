/**
 * postsApi — RTK Query slice.
 *
 * RTK Query generates a reducer, middleware, and React hooks for every
 * endpoint you declare. The generated `useGetPostsQuery` hook handles
 * caching, refetching, deduplication, and invalidation for you.
 */
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { mockApi } from '@/mocks/api';

export const postsApi = createApi({
  reducerPath: 'postsApi',
  baseQuery: fakeBaseQuery<Error>(),
  tagTypes: ['Posts'],
  endpoints: (build) => ({
    getPosts: build.query({
      queryFn: async () => {
        const data = await mockApi.listPosts();
        return { data };
      },
      providesTags: ['Posts'],
    }),
    getPost: build.query({
      queryFn: async (id: number) => {
        try {
          const data = await mockApi.getPost(id);
          return { data };
        } catch (error) {
          return { error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
      providesTags: (_r, _e, id) => [{ type: 'Posts', id }],
    }),
  }),
});

export const { useGetPostsQuery, useGetPostQuery } = postsApi;
