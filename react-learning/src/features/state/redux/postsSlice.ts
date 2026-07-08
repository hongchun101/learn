/**
 * postsSlice — a tiny Redux Toolkit slice.
 *
 * `createSlice` collapses action creators, types, and reducer into one
 * call. `createAsyncThunk` is the standard way to handle async work
 * without leaving the slice file.
 */
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { mockApi } from '@/mocks/api';
import type { Post } from '@/mocks/api';

interface PostsState {
  list: Post[];
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
}

const initial: PostsState = { list: [], status: 'idle', error: null };

export const fetchPosts = createAsyncThunk('posts/fetch', () => mockApi.listPosts());

const slice = createSlice({
  name: 'posts',
  initialState: initial,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPosts.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchPosts.fulfilled, (state, action) => {
        state.status = 'success';
        state.list = action.payload;
      })
      .addCase(fetchPosts.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message ?? 'failed';
      });
  },
});

export const postsReducer = slice.reducer;
