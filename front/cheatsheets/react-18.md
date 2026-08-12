# React 18 速查

## 自动批处理
```jsx
// React 18 全部批处理(setTimeout, Promise, 原生事件)
function handle() {
  setCount(c => c + 1);
  setFlag(f => !f);
  // 一次渲染
}

// 退出批处理
import { flushSync } from 'react-dom';
flushSync(() => setValue(newValue));
```

## useTransition
```jsx
const [isPending, startTransition] = useTransition();

function handleChange(e) {
  setQuery(e.target.value);  // 紧急:输入框受控

  startTransition(() => {
    setResults(heavySearch(e.target.value));  // 非紧急
  });
}

return <>
  <input value={query} onChange={handleChange} />
  {isPending && <Spinner />}
  <Results />
</>;
```

## useDeferredValue
```jsx
function Search() {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  // query 立即更新,deferred 慢一拍
  return <ExpensiveList query={deferred} />;
}
```

## Suspense
```jsx
// 异步组件
const Settings = lazy(() => import('./Settings'));

<Suspense fallback={<Loading />}>
  <Settings />
</Suspense>

// 嵌套 Suspense
<Suspense fallback={<PageSkeleton />}>
  <Suspense fallback={<HeaderSkeleton />}>
    <Header />
  </Suspense>
  <Suspense fallback={<MainSkeleton />}>
    <Main />
  </Suspense>
</Suspense>

// 数据(配合 React Query 等)
import { useSuspenseQuery } from '@tanstack/react-query';

function Page() {
  const { data } = useSuspenseQuery({ queryKey: ['k'], queryFn: fetch });
  return <div>{data.name}</div>;
}

// 配合 Suspense 边界
<Suspense fallback={<Loading />}>
  <Page />
</Suspense>
```

## useId
```jsx
const id = useId();
<label htmlFor={id}>Name</label>
<input id={id} />
// 多次渲染 ID 稳定(SSR/CSR 一致)
```

## 严格模式新行为
```jsx
// React.StrictMode 在开发模式:
// 1. 双调用渲染
// 2. 双调用 effects(setup + cleanup + setup)
// 3. 双调用 state updater

<StrictMode>
  <App />
</StrictMode>

// 影响:
// - 副作用必须幂等
// - 副作用必须能正确清理
```

## 流式 SSR
```jsx
// 服务端
import { renderToPipeableStream } from 'react-dom/server';

app.get('*', (req, res) => {
  const stream = renderToPipeableStream(<App />, {
    onShellReady() {
      res.setHeader('Content-Type', 'text/html');
      stream.pipe(res);
    },
    onError(err) {
      console.error(err);
    }
  });
});
```

## Server Components (RSC)
```jsx
// 仅服务端运行(Next.js App Router 默认)
// 'use client' 标记客户端组件

// app/page.tsx
export default async function Page() {
  const data = await fetch('https://api.example.com');
  return <div>{data.title}</div>;
}

// 不能:
// - useState, useEffect
// - 浏览器 API
// - 事件处理

// 客户端组件
'use client';
import { useState } from 'react';
export function Counter() {
  const [c, setC] = useState(0);
  return <button onClick={() => setC(c + 1)}>{c}</button>;
}
```

## View Transitions
```jsx
// 试验中
import { unstable_ViewTransition as ViewTransition } from 'react';

<ViewTransition>
  <NewPage />
</ViewTransition>
```

## useInsertionEffect
```jsx
// 仅 CSS-in-JS 使用
// 在 DOM 变更前同步执行
useInsertionEffect(() => {
  const style = document.createElement('style');
  style.textContent = `.btn { color: red; }`;
  document.head.appendChild(style);
}, []);
```

## 升级注意
```jsx
// React 18 卸载警告:
// 1. 卸载时 setState → 警告
//    解决: 用 AbortController 中止, 或 cleanup 函数
// 2. 重复键警告
// 3. 不再支持的: 旧版 context API、StringRef、findDOMNode

// createRoot(替代 ReactDOM.render)
import { createRoot } from 'react-dom/client';
const root = createRoot(document.getElementById('root'));
root.render(<App />);
```

## 并发渲染原理
```
React 18 渲染可中断:
1. 高优先级(输入)打断低优先级(重型计算)
2. 用户立即看到响应
3. 后台继续完成被中断渲染

实现: 时间切片(time slicing) + 双缓冲
```