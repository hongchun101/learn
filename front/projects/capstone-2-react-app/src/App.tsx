import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <header>
          <h1>前端专家教程 — React 项目</h1>
        </header>
        <main>
          <p>欢迎!这是教程的 React 项目骨架。</p>
        </main>
      </div>
    </QueryClientProvider>
  );
}