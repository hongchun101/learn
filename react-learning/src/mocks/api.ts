/**
 * Mock API — an in-process data source for the data-router and TanStack
 * Query demos. Lives entirely in memory; restarts on page reload.
 *
 * The functions return Promises so they have the right shape to be used
 * with `defer` (returning a non-Promise synchronously, with a Promise
 * inside) or to be awaited in a loader.
 */

export interface Post {
  id: number;
  title: string;
  body: string;
  authorId: number;
}

export interface Author {
  id: number;
  name: string;
}

const AUTHORS: Author[] = [
  { id: 1, name: 'Grace Hopper' },
  { id: 2, name: 'Alan Turing' },
  { id: 3, name: 'Ada Lovelace' },
];

const POSTS: Post[] = [
  { id: 1, title: 'On compilers', body: '...', authorId: 1 },
  { id: 2, title: 'The halting problem', body: '...', authorId: 2 },
  { id: 3, title: 'Notes on the Analytical Engine', body: '...', authorId: 3 },
  { id: 4, title: 'COBOL: a love letter', body: '...', authorId: 1 },
];

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

export const mockApi = {
  listPosts: (): Promise<Post[]> => delay([...POSTS]),
  getPost: (id: number): Promise<Post> => {
    const post = POSTS.find((p) => p.id === id);
    if (!post) return Promise.reject(new Error(`post ${id} not found`));
    return delay(post);
  },
  getAuthor: (id: number): Promise<Author> => {
    const author = AUTHORS.find((a) => a.id === id);
    if (!author) return Promise.reject(new Error(`author ${id} not found`));
    // Simulate a slow lookup so the deferred demo actually shows the
    // "fast UI, slow data" pattern.
    return delay(author, 700);
  },
  listAuthors: (): Promise<Author[]> => delay([...AUTHORS]),
};
