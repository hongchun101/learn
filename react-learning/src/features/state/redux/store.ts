/**
 * Redux store — combines the slice and the RTK Query API.
 */
import { configureStore } from '@reduxjs/toolkit';
import { postsApi } from './postsApi';
import { postsReducer } from './postsSlice';

export const reduxStore = configureStore({
  reducer: {
    posts: postsReducer,
    [postsApi.reducerPath]: postsApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(postsApi.middleware),
});

export type AppDispatch = typeof reduxStore.dispatch;
export type RootState = ReturnType<typeof reduxStore.getState>;
