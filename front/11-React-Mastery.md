# 11 · React 精通

> React 不是"框架",它是**UI = f(state)** 的编程范式。精通 React = 理解它的协调器、并发模型、状态范式、性能瓶颈。

## 📌 心智模型

```
React 的核心:
  • 声明式 UI (JSX = 虚拟 DOM 的描述)
  • 组件化 (组合优于继承)
  • 单向数据流 (props down, events up)
  • 协调算法 (Reconciliation)
  • 并发模式 (Concurrent React)

版本: 18+ 默认开启并发
```

## 11.1 JSX 与渲染

### 11.1.1 JSX 本质
```jsx
// JSX
const el = <div className="a" onClick={handle}>Hi {name}</div>;

// 编译后
const el = React.createElement('div', { className: 'a', onClick: handle }, 'Hi ', name);
```

### 11.1.2 Fragment & Suspense
```jsx
return (
  <>
    <Header />
    <Main />
  </>
);

// Fragment 带 key
return items.map(item => (
  <Fragment key={item.id}>
    <td>{item.a}</td>
    <td>{item.b}</td>
  </Fragment>
));
```

### 11.1.3 错误边界
```jsx
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    reportError(error, info.componentStack);
  }
  render() {
    if (this.state.error) return <FallbackUI error={this.state.error} />;
    return this.props.children;
  }
}
```

## 11.2 组件模式

### 11.2.1 函数组件
```jsx
type Props = { userId: string; showDetails?: boolean };

const UserCard = ({ userId, showDetails = false }: Props) => {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  if (!user) return <Skeleton />;
  return (
    <article>
      <h2>{user.name}</h2>
      {showDetails && <p>{user.bio}</p>}
    </article>
  );
};
```

### 11.2.2 类组件(历史)
```jsx
class Counter extends React.Component<Props, State> {
  state = { count: 0 };

  static getDerivedStateFromProps(props, state) { /* ... */ }

  componentDidMount() { /* 副作用 */ }
  componentDidUpdate(prevProps) { /* ... */ }
  componentWillUnmount() { /* 清理 */ }

  shouldComponentUpdate(nextProps, nextState) {
    return nextState.count !== this.state.count;
  }

  render() {
    return <div>{this.state.count}</div>;
  }
}
```

**专家技巧:** 新代码永远用函数组件。类组件只在维护老代码或错误边界时用。

### 11.2.3 高阶组件 (HOC)
```jsx
function withAuth<P extends object>(Component: ComponentType<P>) {
  return function AuthedComponent(props: P) {
    const user = useUser();
    if (!user) return <Redirect to="/login" />;
    return <Component {...props} user={user} />;
  };
}
```

**HOC 问题:** 嵌套地狱、props 命名冲突。**优先用 hooks**。

### 11.2.4 Render Props
```jsx
<Mouse>
  {({ x, y }) => <Cursor x={x} y={y} />}
</Mouse>

const Mouse = ({ children }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = e => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return children(pos);
};
```

### 11.2.5 Compound Components (复合组件)
```jsx
const Tabs = ({ children }) => {
  const [active, setActive] = useState(0);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      {children}
    </TabsContext.Provider>
  );
};

Tabs.List = ({ children }) => <div role="tablist">{children}</div>;
Tabs.Tab = ({ index, children }) => {
  const { active, setActive } = useTabsContext();
  return (
    <button role="tab" aria-selected={active === index} onClick={() => setActive(index)}>
      {children}
    </button>
  );
};

// 使用
<Tabs>
  <Tabs.List>
    <Tabs.Tab index={0}>Tab 1</Tabs.Tab>
    <Tabs.Tab index={1}>Tab 2</Tabs.Tab>
  </Tabs.List>
</Tabs>
```

### 11.2.6 Headless Components
```jsx
// 提供逻辑,UI 由用户决定
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  return {
    on,
    toggle: () => setOn(o => !o),
    setOn,
    setOff: () => setOn(false),
    bind: { onClick: () => setOn(o => !o), 'aria-pressed': on },
  };
}

// Radix UI / Headless UI 思路
```

## 11.3 Hooks 精通

### 11.3.1 useState
```jsx
// 基础
const [count, setCount] = useState(0);
setCount(c => c + 1);  // 函数式更新(推荐)

// 惰性初始化
const [data, setData] = useState(() => JSON.parse(localStorage.getItem('data') || 'null'));
```

### 11.3.2 useEffect
```jsx
// 依赖数组
useEffect(() => {
  const sub = subscribe(id, handler);
  return () => sub.unsubscribe();
}, [id]);  // 依赖

// 空依赖:仅挂载/卸载
useEffect(() => {
  fetchInitial();
}, []);

// 无依赖:每次渲染后执行(谨慎)
useEffect(() => {
  // 几乎不用
});

// 竞态保护
useEffect(() => {
  let cancelled = false;
  fetch(`/api/${id}`).then(r => r.json()).then(data => {
    if (!cancelled) setData(data);
  });
  return () => { cancelled = true; };
}, [id]);
```

### 11.3.3 useEffect 的本质问题与替代方案

**问题:** useEffect 在 commit 后运行,容易出现"渲染抖动"。

**useEffectEvent (实验性):**
```jsx
const onClick = useEffectEvent(() => {
  // 拿到最新 state,但 effect 不需要这个为依赖
  console.log(count);
});

useEffect(() => {
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}, []);  // 依赖空,onClick 总是最新
```

**useEffectEvent polyfill:**
```jsx
function useEffectEvent(fn) {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback((...args) => ref.current(...args), []);
}
```

### 11.3.4 useLayoutEffect
```jsx
// 在 DOM 更新后、浏览器绘制前同步执行
useLayoutEffect(() => {
  // 测量 DOM / 同步修改,避免闪烁
  ref.current.style.height = `${measureRef.current.scrollHeight}px`;
}, [content]);
```

**SSR 注意:** 在 SSR 时会警告。解决:用 `useIsomorphicLayoutEffect`。
```jsx
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
```

### 11.3.5 useMemo / useCallback
```jsx
// useMemo: 缓存计算结果
const sorted = useMemo(
  () => [...items].sort((a, b) => a.value - b.value),
  [items]
);

// useCallback: 缓存函数引用
const onSelect = useCallback((id) => selectItem(id), [selectItem]);

// 何时用:
// 1. 计算昂贵(> 1ms)
// 2. 引用作为 props 传给 memo 组件
// 3. 引用作为 useEffect 依赖
```

### 11.3.6 useRef
```jsx
// 1. DOM 引用
const inputRef = useRef<HTMLInputElement>(null);
inputRef.current?.focus();

// 2. 可变值(不触发渲染)
const timerRef = useRef<NodeNumber | null>(null);
timerRef.current = setTimeout(...);

// 3. 持有最新值
const latestValueRef = useRef(value);
useEffect(() => { latestValueRef.current = value; }, [value]);
```

### 11.3.7 useReducer
```jsx
type State = { count: number };
type Action = { type: 'inc' } | { type: 'dec' } | { type: 'set'; value: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'inc': return { count: state.count + 1 };
    case 'dec': return { count: state.count - 1 };
    case 'set': return { count: action.value };
  }
}

const [state, dispatch] = useReducer(reducer, { count: 0 });

// 复杂状态:多个 useState → 一个 useReducer
// 远程状态: 状态在另一处(URL、storage),可以用 reducer 同步
```

### 11.3.8 useContext
```jsx
const ThemeContext = createContext<Theme>('light');

function App() {
  return (
    <ThemeContext.Provider value="dark">
      <Page />
    </ThemeContext.Provider>
  );
}

function Page() {
  const theme = useContext(ThemeContext);  // 'dark'
}

// 性能陷阱:
// Context 值变化,所有消费者重渲染
// 解决: useMemo + 拆分 provider
const value = useMemo(() => ({ theme, setTheme }), [theme]);
```

### 11.3.9 自定义 Hook
```jsx
// 1. 同步外部状态到 React
function useSyncExternalStore<T>(subscribe, getSnapshot, getServerSnapshot?) {
  // 订阅外部 store(redux/zustand/任意)
}

// 2. 封装通用逻辑
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

// 3. 防抖值
function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// 4. 上次值
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; });
  return ref.current;
}

// 5. 媒体查询
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

// 6. 异步数据(自定义)
function useAsync<T>(fn: () => Promise<T>, deps: any[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({
    loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    fn().then(
      data => !cancelled && setState({ data, loading: false }),
      error => !cancelled && setState({ error, loading: false })
    );
    return () => { cancelled = true; };
  }, deps);
  return state;
}

// 但更推荐用 React Query / SWR(缓存/重试/取消/去重/SSR)
```

### 11.3.10 Hooks 依赖数组规范
```jsx
// ❌ 漏依赖
useEffect(() => {
  console.log(count);
}, []);  // 不会重新执行

// ✅ 完整依赖
useEffect(() => {
  console.log(count);
}, [count]);

// ✅ 函数式更新避免依赖
useEffect(() => {
  const id = setInterval(() => setCount(c => c + 1), 1000);
  return () => clearInterval(id);
}, []);

// eslint-plugin-react-hooks 自动检查
```

## 11.4 性能优化

### 11.4.1 React.memo
```jsx
const Row = React.memo(({ data, onSelect }) => {
  console.log('render Row', data.id);
  return <li onClick={() => onSelect(data.id)}>{data.name}</li>;
});

// 默认浅比较
// 自定义比较
const Row2 = React.memo(Row, (prev, next) => prev.data.id === next.data.id);
```

### 11.4.2 避免大上下文
```jsx
// ❌ 一个 context 装所有
<GlobalContext.Provider value={{ user, theme, cart, settings }}>

// ✅ 拆开
<UserContext.Provider value={user}>
  <ThemeContext.Provider value={theme}>
    <CartContext.Provider value={cart}>
      ...
```

### 11.4.3 状态切片
```jsx
// ❌ 整个对象作为 state
const [user, setUser] = useState({ name: 'A', age: 30 });

// ✅ 切片
const [name, setName] = useState('A');
const [age, setAge] = useState(30);

// ✅ 或用 useReducer
const [state, dispatch] = useReducer(reducer, initial);
```

### 11.4.4 列表优化
```jsx
// ❌ 无 key
items.map(item => <Item {...item} />)

// ✅ 用稳定 ID
items.map(item => <Item key={item.id} {...item} />)

// ❌ index 作为 key (会错乱)
items.map((item, i) => <Item key={i} {...item} />)
```

### 11.4.5 虚拟列表
```jsx
import { useVirtualizer } from '@tanstack/react-virtual';

function List({ items }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });

  return (
    <div ref={parentRef} style={{ height: 400, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vi => (
          <div
            key={vi.key}
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0,
              transform: `translateY(${vi.start}px)`,
              height: vi.size,
            }}
          >
            {items[vi.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 11.4.6 Profiler
```jsx
import { Profiler } from 'react';

<Profiler id="App" onRender={(id, phase, actualDuration) => {
  if (actualDuration > 100) console.warn(`${id} 慢: ${actualDuration}ms`);
}}>
  <App />
</Profiler>
```

### 11.4.7 React DevTools
- Profiler 标签:录制交互,看组件渲染时长
- "为什么这个组件渲染"功能
- components 标签:看 props/state/hooks

## 11.5 并发模式 (Concurrent React)

### 11.5.1 自动批处理 (Automatic Batching)
```jsx
// React 18+ 全部批处理
function handleClick() {
  setCount(c => c + 1);
  setFlag(f => !f);
  // 一次渲染
}

// ❌ React 17 不会批处理(在 setTimeout / promise 中)
```

### 11.5.2 useTransition
```jsx
const [isPending, startTransition] = useTransition();

function handleChange(e) {
  // 紧急更新:输入框受控
  setInputValue(e.target.value);

  // 非紧急:重型计算
  startTransition(() => {
    setSearchResults(heavyFilter(items, e.target.value));
  });
}

// isPending: 显示 loading 状态
return <>{isPending && <Spinner />} ...</>;
```

### 11.5.3 useDeferredValue
```jsx
function Search() {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  // 列表用 deferred,延迟渲染
  return <List filter={deferred} />;
}
```

### 11.5.4 Suspense
```jsx
// 1. 异步组件 (lazy)
const Settings = lazy(() => import('./Settings'));

<Suspense fallback={<Loading />}>
  <Settings />
</Suspense>

// 2. 数据加载 (框架集成)
// React Query / SWR:用 <Suspense> 配合
function App() {
  return (
    <Suspense fallback={<Skeleton />}>
      <UserProfile />  {/* 内部 useSuspenseQuery */}
    </Suspense>
  );
}

// 3. 嵌套
<Suspense fallback={<PageSkeleton />}>
  <Suspense fallback={<ProfileSkeleton />}>
    <UserProfile />
  </Suspense>
  <Suspense fallback={<FeedSkeleton />}>
    <UserFeed />
  </Suspense>
</Suspense>
```

### 11.5.5 useId
```jsx
const id = useId();  // SSR 安全 ID
<label htmlFor={id}>Name</label>
<input id={id} />
```

### 11.5.6 useSyncExternalStore
```jsx
function useStore(store) {
  return useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getServerState  // SSR
  );
}
```

## 11.6 状态管理

### 11.6.1 选择标准
| 规模 | 推荐 |
|------|------|
| 小 | useState/useReducer |
| 中 | Context + useReducer |
| 中大 | Zustand / Jotai |
| 大 | Redux Toolkit / Zustand + Query |
| 表单 | React Hook Form / Formik |
| 远程 | React Query / SWR |

### 11.6.2 Zustand
```jsx
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

const useStore = create(
  devtools(
    persist(
      (set, get) => ({
        count: 0,
        user: null,
        inc: () => set(state => ({ count: state.count + 1 })),
        setUser: (user) => set({ user }),
        // 选择器
        doubleCount: () => get().count * 2,
      }),
      { name: 'app-storage' }
    )
  )
);

// 使用
const count = useStore(s => s.count);
const inc = useStore(s => s.inc);
```

### 11.6.3 Jotai (原子化)
```jsx
import { atom, useAtom } from 'jotai';

const countAtom = atom(0);
const doubleAtom = atom(get => get(countAtom) * 2);

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const [double] = useAtom(doubleAtom);
  return <button onClick={() => setCount(c => c + 1)}>{count}/{double}</button>;
}
```

### 11.6.4 Redux Toolkit (大型)
```jsx
import { configureStore, createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { useSelector, useDispatch } from 'react-redux';

const userSlice = createSlice({
  name: 'user',
  initialState: { data: null, loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUser.pending, (s) => { s.loading = true; })
      .addCase(fetchUser.fulfilled, (s, a) => { s.data = a.payload; s.loading = false; });
  },
});

const store = configureStore({ reducer: { user: userSlice.reducer } });
```

### 11.6.5 表单 (React Hook Form + Zod)
```jsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
});

function Form() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = data => console.log(data);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span>{errors.name.message}</span>}
      <input {...register('email')} />
      <button type="submit">提交</button>
    </form>
  );
}
```

## 11.7 路由

### 11.7.1 React Router v6
```jsx
import { createBrowserRouter, RouterProvider, useParams, useNavigate } from 'react-router-dom';

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/user/:id', element: <User /> },
  {
    path: '/dashboard',
    element: <Dashboard />,
    loader: async () => await fetchDashboardData(),
    children: [
      { index: true, element: <DashboardHome /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);

function User() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <button onClick={() => navigate('/')}>Home</button>;
}
```

### 11.7.2 路由级代码分割
```jsx
const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const router = createBrowserRouter([
  { path: '/', element: <Suspense fallback={<Loading />}><Home /></Suspense> },
]);
```

## 11.8 数据获取

### 11.8.1 React Query / TanStack Query
```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function User({ id }) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn: () => fetch(`/api/users/${id}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    retry: 3,
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (newUser) => fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(newUser),
    }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  if (isLoading) return <Skeleton />;
  if (error) return <Error />;
  return <div>{data.name}</div>;
}
```

### 11.8.2 SSR / SSG (Next.js App Router)
```typescript
// app/page.tsx
export default async function Page() {
  const data = await fetch('https://api.example.com', { cache: 'no-store' });
  const json = await data.json();
  return <div>{json.title}</div>;
}

// 静态
export const revalidate = 3600;

// 客户端组件
'use client';
import { useState } from 'react';
export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

## 11.9 动画

### 11.9.1 Framer Motion
```jsx
import { motion, AnimatePresence } from 'framer-motion';

function List({ items }) {
  return (
    <AnimatePresence>
      {items.map(item => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -100 }}
          layout
        >
          {item.name}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
```

### 11.9.2 React Transition Group
```jsx
import { CSSTransition, TransitionGroup } from 'react-transition-group';

<TransitionGroup>
  {items.map(item => (
    <CSSTransition key={item.id} timeout={300} classNames="fade">
      <Item {...item} />
    </CSSTransition>
  ))}
</TransitionGroup>
```

### 11.9.3 View Transitions API (现代)
```jsx
// 配合 react-router 的 view transitions
import { unstable_ViewTransition as ViewTransition } from 'react';

<ViewTransition>
  <UserProfile />
</ViewTransition>
```

## 11.10 测试

### 11.10.1 Vitest + RTL
```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Counter', () => {
  it('renders and increments', async () => {
    const user = userEvent.setup();
    render(<Counter />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
```

### 11.10.2 组件契约测试
```jsx
import { expect, test } from 'vitest';
import { render } from '@testing-library/react';

test('Button matches snapshot', () => {
  const { asFragment } = render(<Button>Click</Button>);
  expect(asFragment()).toMatchSnapshot();
});
```

### 11.10.3 Storybook
```typescript
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta<typeof Button> = {
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary'] },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Click' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Click' },
};
```

## 11.11 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| index 作为 key | 列表错乱 | 用稳定 ID |
| Context 大对象 | 全树重渲染 | 拆分 Provider + useMemo |
| useEffect 修改 state | 二次渲染 | 用 useMemo / 派生状态 |
| 漏依赖 | 失效 | 装 eslint-plugin-react-hooks |
| 在 render 中订阅 | 内存泄漏 | useEffect |
| ref 当 state | UI 不同步 | 用 useState |
| 直接修改 state | 不更新 | 用新引用 |
| useMemo 过度使用 | 内存占用 | 仅昂贵计算时用 |
| useTransition 滥用 | 体验变差 | 仅非紧急更新用 |
| 类组件过度 | 难复用 | 改函数 + hooks |

## 11.12 实战项目

### 🎯 项目 1: 完整电商 SPA (React + TS + Router + Query + Zustand)
要求:
- 路由 + 懒加载
- 商品列表/详情/购物车/结算
- 数据持久化
- 完整 a11y
- Lighthouse 90+
- Storybook

### 🎯 项目 2: 富文本编辑器
要求:
- 自定义数据模型
- 撤销/重做
- 协作编辑 (CRDT / OT)
- 命令系统
- 键盘快捷键
- 插件化

### 🎯 项目 3: 微前端应用
要求:
- Module Federation 配置
- 主应用 + 3 个子应用
- 共享组件库
- 路由协调
- 状态共享
- 独立部署

## ✅ 本章检查清单

- [ ] Hooks 规则、依赖数组、自定义 Hook 写得出
- [ ] useEffect 的竞态、依赖陷阱能避免
- [ ] useTransition / useDeferredValue 用过
- [ ] Suspense + 异步组件用过
- [ ] Zustand / Jotai / RTK 任一会
- [ ] React Query 用过
- [ ] 性能优化 5 招都会
- [ ] 完成 3 个实战项目

**下一章:** → [12-Vue3-Mastery.md](./12-Vue3-Mastery.md)