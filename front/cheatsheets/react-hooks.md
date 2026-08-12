# React Hooks 速查

## useState
```jsx
const [count, setCount] = useState(0);
setCount(c => c + 1);             // 函数式更新(基于上次)
const [data, setData] = useState(() => heavy());  // 惰性初始化
```

## useEffect
```jsx
useEffect(() => {
  // mount/update
  const sub = subscribe(id, handler);
  return () => sub.unsubscribe(); // cleanup
}, [id]);  // 依赖

// 竞态保护
useEffect(() => {
  let cancelled = false;
  fetch(url).then(data => !cancelled && setData(data));
  return () => { cancelled = true; };
}, [id]);
```

## useLayoutEffect
```jsx
// commit 后同步执行(浏览器绘制前)
useLayoutEffect(() => {
  ref.current.style.height = `${measureRef.current.scrollHeight}px`;
}, [deps]);

// SSR 警告 → 用 useIsomorphicLayoutEffect
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
```

## useMemo / useCallback
```jsx
const sorted = useMemo(() => arr.sort(cmp), [arr]);
const onSelect = useCallback(id => do(id), []);

// 何时用: 计算昂贵/传给 memo 组件/作 useEffect 依赖
```

## useRef
```jsx
const ref = useRef(null);          // DOM ref
ref.current?.focus();

const timerRef = useRef(null);     // 可变值(不触发渲染)
timerRef.current = setTimeout(...);

const latestRef = useRef(value);  // 持有最新值
useEffect(() => { latestRef.current = value; });
```

## useReducer
```jsx
const [state, dispatch] = useReducer(reducer, initial);

// 优于 useState:
// - 复杂状态(多个子值)
// - 下一状态依赖上一状态
// - 需要派发多种操作
```

## useContext
```jsx
const Theme = createContext('light');
<Theme.Provider value="dark">
const theme = useContext(Theme);

// 性能陷阱: Context 变化,所有消费者重渲染
// 解决: 拆分 Provider + useMemo value
```

## useTransition
```jsx
const [isPending, startTransition] = useTransition();

startTransition(() => {
  // 非紧急更新
  setHeavyValue(compute(input));
});

// 输入框立即响应,重型计算低优先级
```

## useDeferredValue
```jsx
const [query, setQuery] = useState('');
const deferred = useDeferredValue(query);
// 列表用 deferred,延迟渲染
```

## useId
```jsx
const id = useId();  // SSR 安全唯一 ID
<label htmlFor={id}>Name</label>
<input id={id} />
```

## useSyncExternalStore
```jsx
const state = useSyncExternalStore(
  store.subscribe,
  store.getState,
  store.getServerSnapshot  // SSR
);
```

## useImperativeHandle
```jsx
const Input = forwardRef((props, ref) => {
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => setValue(''),
  }));
  return <input ref={inputRef} {...props} />;
});
```

## 自定义 Hook
```jsx
// 1. LocalStorage
function useLocalStorage(key, initial) {
  const [v, setV] = useState(() => {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : initial;
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(v)), [key, v]);
  return [v, setV];
}

// 2. 防抖
function useDebounce(value, ms = 300) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

// 3. 上次值
function usePrevious(value) {
  const r = useRef();
  useEffect(() => { r.current = value; });
  return r.current;
}

// 4. 媒体查询
function useMedia(q) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const x = window.matchMedia(q);
    setM(x.matches);
    const h = e => setM(e.matches);
    x.addEventListener('change', h);
    return () => x.removeEventListener('change', h);
  }, [q]);
  return m;
}

// 5. 异步数据(简单版)
function useAsync(fn, deps) {
  const [s, setS] = useState({ loading: true });
  useEffect(() => {
    let c = false;
    setS({ loading: true });
    fn().then(
      d => !c && setS({ data: d, loading: false }),
      e => !c && setS({ error: e, loading: false })
    );
    return () => { c = true; };
  }, deps);
  return s;
}
```

## 规则
```
1. 顶层调用,不在 if/for 内
2. 仅在 React 函数中调用
3. 依赖数组完整
4. 自定义 Hook 必须 useXxx 命名
5. eslint-plugin-react-hooks 自动检查
```