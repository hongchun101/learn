# 08 · TypeScript 精通

> TypeScript 不是 JavaScript 的"类型层",它是**开发体验、运行时安全性、团队协作**的载体。专家级 TS = 类型即文档 + 类型即测试。

## 📌 心智模型

```
TypeScript 的类型系统 = 结构性子类型 + 类型推断 + 类型操作

核心原则:
  • 类型服务于逻辑,不是炫技
  • 优先用类型推断,只在需要时显式标注
  • 类型即接口,接口即合约
  • 任何运行时安全的代价是类型代码
```

## 8.1 基础类型

### 8.1.1 原始类型
```typescript
let str: string = 'hi';
let num: number = 42;
let bool: boolean = true;
let big: bigint = 100n;
let sym: symbol = Symbol('id');
let nil: null = null;
let undef: undefined = undefined;

// 严格模式 (推荐)
let strict: string | null = null;  // 联合类型

// 字面量类型
let dir: 'left' | 'right' | 'up' | 'down';
let status: 200 | 404 | 500;
```

### 8.1.2 对象类型
```typescript
interface User {
  id: number;
  name: string;
  email?: string;  // 可选
  readonly createdAt: Date;  // 只读
}

type Point = {
  x: number;
  y: number;
};

// interface vs type
// - interface 可声明合并、可 extends
// - type 可联合/交叉、可映射
```

### 8.1.3 数组与元组
```typescript
let nums: number[] = [1, 2, 3];
let arr: Array<string> = ['a', 'b'];

let pair: [string, number] = ['x', 1];  // 元组
let optional: [string, number?] = ['x']; // 可选
let rest: [string, ...number[]] = ['x', 1, 2, 3];

// 只读
let readonly: ReadonlyArray<number> = [1, 2, 3];
let readonlyTuple: readonly [string, number] = ['x', 1];
```

### 8.1.4 函数类型
```typescript
// 完整签名
function add(a: number, b: number): number {
  return a + b;
}

// 类型别名
type Add = (a: number, b: number) => number;

// 可选/默认/剩余
type Fn = (a: string, b?: number, ...rest: any[]) => void;

// this 类型
interface Obj {
  fn(this: Obj): void;
}

// 重载
function parse(input: string): string;
function parse(input: number): number;
function parse(input: string | number): string | number {
  return typeof input === 'string' ? input.toUpperCase() : input;
}
```

## 8.2 联合与交叉

### 8.2.1 联合类型
```typescript
type Status = 'idle' | 'loading' | 'success' | 'error';

function process(s: Status) {
  switch (s) {
    case 'idle': /* ... */ break;
    case 'loading': /* ... */ break;
    // 穷尽检查
  }
}

// 区分联合(discriminated union)
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; size: number }
  | { kind: 'rect'; width: number; height: number };

function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.radius ** 2;
    case 'square': return s.size ** 2;
    case 'rect': return s.width * s.height;
  }
}
```

### 8.2.2 交叉类型
```typescript
type A = { a: string };
type B = { b: number };
type C = A & B;  // { a: string; b: number }

// mixin
type WithTimestamps<T> = T & { createdAt: Date; updatedAt: Date };
```

## 8.3 类型守卫与窄化

```typescript
// typeof
function process(v: string | number) {
  if (typeof v === 'string') {
    v.toUpperCase();  // 已窄化为 string
  }
}

// instanceof
class A {}
class B {}
function fn(x: A | B) {
  if (x instanceof A) {
    x.aMethod();
  }
}

// in
type Cat = { meow: () => void };
type Dog = { bark: () => void };
function speak(pet: Cat | Dog) {
  if ('meow' in pet) pet.meow();
  else pet.bark();
}

// 自定义类型谓词
function isString(v: unknown): v is string {
  return typeof v === 'string';
}

// 断言函数
function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

function process(x: string | number) {
  assert(typeof x === 'string');
  x.toUpperCase();  // 已窄化
}
```

## 8.4 泛型

### 8.4.1 基础泛型
```typescript
function identity<T>(value: T): T {
  return value;
}

const n = identity<number>(42);  // 显式
const s = identity('hi');        // 推断 string
```

### 8.4.2 约束泛型
```typescript
// extends 约束
function getProp<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
getProp({ a: 1, b: 2 }, 'a');  // number

// 默认类型
type ApiResponse<T = unknown> = {
  data: T;
  error?: Error;
};
```

### 8.4.3 高级泛型
```typescript
// 条件类型
type IsString<T> = T extends string ? true : false;
type T1 = IsString<'hi'>;  // true
type T2 = IsString<42>;     // false

// infer
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
type Unwrap<T> = T extends Promise<infer U> ? U : T;
type UnwrapArray<T> = T extends (infer U)[] ? U : never;
```

### 8.4.4 工具泛型
```typescript
// Partial<T>           全部可选
// Required<T>          全部必选
// Readonly<T>          全部只读
// Pick<T, K>           选属性
// Omit<T, K>           去属性
// Exclude<T, U>        排除联合
// Extract<T, U>        提取联合
// NonNullable<T>       排除 null/undefined
// Record<K, V>         键值映射

// 自定义工具类型
type Nullable<T> = T | null;
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// 函数参数提取
type Parameters<T extends (...args: any[]) => any> = T extends (...args: infer P) => any ? P : never;
type FirstArg<T> = T extends (first: infer F, ...rest: any[]) => any ? F : never;
```

## 8.5 类型体操(实战)

### 8.5.1 Promise.all 类型
```typescript
type Awaited<T> = T extends Promise<infer U> ? Awaited<U> : T;

type PromiseAll<T extends readonly unknown[]> = {
  [K in keyof T]: Awaited<T[K]>;
};

declare function all<T extends readonly unknown[] | []>(
  values: T
): Promise<PromiseAll<T>>;
```

### 8.5.2 Tuple to Union
```typescript
type TupleToUnion<T extends readonly unknown[]> = T[number];
type T = TupleToUnion<[1, 'a', true]>;  // 1 | 'a' | true
```

### 8.5.3 深度 Readonly
```typescript
type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
```

### 8.5.4 字符串字面量操作
```typescript
type Upper<S extends string> = S extends `${infer F}${infer Rest}`
  ? `${Uppercase<F>}${Rest}`
  : S;

// 路径对象
type Path<T> = T extends object
  ? { [K in keyof T]: K extends string ? `${K}` | `${K}.${Path<T[K]>}` : never }[keyof T]
  : never;
```

## 8.6 映射类型

```typescript
// 修饰符
type Readonly2<T> = { readonly [P in keyof T]: T[P] };
type Optional2<T> = { [P in keyof T]?: T[P] };

// 键重映射
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type User = { id: number; name: string };
type G = Getters<User>;
// { getId: () => number; getName: () => string }

// 过滤
type PickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};
type OnlyStrings = PickByType<User, string>;  // { name: string }
```

## 8.7 模板字面量类型

```typescript
type Event = 'click' | 'focus' | 'blur';
type Handler = `on${Capitalize<Event>}`;
// 'onClick' | 'onFocus' | 'onBlur'

type CSSProp = `--${string}`;
type Route = `/${string}`;

type ExtractRouteParams<T extends string> =
  T extends `${string}:${infer P}/${infer R}`
    ? { [K in P | ExtractRouteParams<`/${R}`>]: string }
    : T extends `${string}:${infer P}`
    ? { [K in P]: string }
    : {};
```

## 8.8 高级类型

### 8.8.1 this 参数
```typescript
class Chain {
  value = 0;
  add(n: number): this {
    this.value += n;
    return this;
  }
  // 类型 this:Chain,子类继承自动变为子类
}
```

### 8.8.2 协变 / 逆变
```typescript
// 函数参数是逆变的,返回值是协变的
type Handler<T> = (x: T) => void;
type H1 = Handler<Animal>;
type H2 = Handler<Dog>;

// Dog 是 Animal 的子类型,但 H1 不能赋值给 H2
// (能用 Animal handler 处理 Dog,但反过来不安全)
```

### 8.8.3 协变工具
```typescript
// 让对象只读
type Writable<T> = { -readonly [K in keyof T]: T[K] };

// 让可选必填
type Concrete<T> = { [K in keyof T]-?: T[K] };

// 移除 this 类型
type NoThis<T> = T extends (this: infer _, ...args: infer A) => infer R
  ? (...args: A) => R
  : T;
```

## 8.9 声明文件 (.d.ts)

### 8.9.1 模块声明
```typescript
// types/foo.d.ts
declare module 'foo' {
  export function bar(x: number): string;
  export default class Foo {
    constructor();
    greet(): void;
  }
}

// 引入后:
import foo, { bar } from 'foo';
```

### 8.9.2 全局声明
```typescript
declare global {
  interface Window {
    myApp: { version: string };
  }
  function myUtil(): void;
}

export {};
```

### 8.9.3 第三方库
```typescript
// DefinitelyTyped (DT) - @types/lodash
// 自己写时按包的实际结构声明
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}
```

## 8.10 实用技巧

### 8.10.1 编译选项 (tsconfig.json)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,  // 数组越界返回 undefined
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### 8.10.2 强制严格模式
```typescript
// 不用 any,用 unknown 替代
// 不用 @ts-ignore,用 @ts-expect-error + 注释原因
function process(value: unknown) {
  if (typeof value === 'string') {
    value.toUpperCase();  // 安全
  }
}
```

### 8.10.3 巧用 Branded Types
```typescript
type Brand<T, B> = T & { __brand: B };
type UserId = Brand<string, 'UserId'>;
type Email = Brand<string, 'Email'>;

function getUser(id: UserId) { /* ... */ }

const rawId = '123';
getUser(rawId);  // ❌ Type 'string' is not assignable to 'UserId'
getUser(rawId as UserId);  // 显式断言
```

### 8.10.4 const 断言
```typescript
const arr = [1, 2, 3];          // number[]
const arr2 = [1, 2, 3] as const; // readonly [1, 2, 3]

const config = {
  api: '/api',
  timeout: 5000,
} as const;  // { readonly api: '/api'; readonly timeout: 5000 }
```

### 8.10.5 satisfies 运算符 (4.9+)
```typescript
const config = {
  api: '/api',
  methods: ['GET', 'POST'],
} satisfies Record<string, unknown>;
// 类型保留字面量,同时保证符合 Record<string, unknown>
config.methods.map(m => m.toLowerCase());  // 类型仍是字面量数组 ✅
```

## 8.11 装饰器

```typescript
// 实验性,需开启 experimentalDecorators
function logged(target: any, key: string, descriptor: PropertyDescriptor) {
  const fn = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(`Call: ${key}`);
    return fn.apply(this, args);
  };
}

class Service {
  @logged
  fetch(id: number) { return id; }
}
```

## 8.12 性能与工具

### 8.12.1 类型体操性能
```typescript
// 避免过深的递归类型,可能拖慢编译
// 复杂类型放在 .d.ts 或独立文件
// 用 TypeScript 项目引用分割大型项目
```

### 8.12.2 ts-toolbelt
```typescript
import { Object } from 'ts-toolbelt';
type O = Object.Patch<User, { id: string }>;
type O2 = Object.Required<User>;
```

## 8.13 React 中的 TypeScript

### 8.13.1 组件类型
```typescript
import { ReactNode, ComponentProps, FC } from 'react';

// 1. 函数组件
type ButtonProps = {
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  children: ReactNode;
};

const Button: FC<ButtonProps> = ({ variant = 'primary', onClick, children }) => (
  <button onClick={onClick} className={variant}>{children}</button>
);

// 2. 扩展原生属性
type ButtonProps2 = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary';
};

// 3. 泛型组件
type ListProps<T> = {
  items: T[];
  renderItem: (item: T) => ReactNode;
};
function List<T>({ items, renderItem }: ListProps<T>) { /* ... */ }

// 4. forwardRef
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <input ref={ref} {...props} />
));

// 5. 高阶组件 / 包装
function withLoading<P extends object>(
  Component: FC<P>
): FC<P & { loading?: boolean }> {
  return ({ loading, ...props }) =>
    loading ? <Spinner /> : <Component {...(props as P)} />;
}
```

### 8.13.2 Hooks 类型
```typescript
// useState 自动推断
const [count, setCount] = useState(0);  // number

// 显式类型
const [user, setUser] = useState<User | null>(null);

// useRef
const inputRef = useRef<HTMLInputElement>(null);
inputRef.current?.focus();

// useReducer
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

// 自定义 hook
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : initial;
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}
```

## 8.14 Vue3 中的 TypeScript

```typescript
<script setup lang="ts">
import { ref, computed } from 'vue';

interface User {
  id: number;
  name: string;
}

const user = ref<User | null>(null);
const fullName = computed(() => user.value?.name ?? 'Anonymous');

// defineProps 类型
const props = defineProps<{
  msg: string;
  count?: number;
}>();

// defineEmits
const emit = defineEmits<{
  (e: 'change', value: string): void;
  (e: 'submit'): void;
}>();

// 模板 ref
const inputEl = ref<HTMLInputElement | null>(null);
</script>
```

## 8.15 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 滥用 `any` | 类型保护失效 | 用 `unknown` |
| 类型断言过多 | 类型与运行时不符 | 用类型守卫 |
| 接口 vs 类型混乱 | 重构噩梦 | 团队规范 |
| 联合类型忘了穷尽检查 | 运行时漏分支 | switch + never |
| 泛型过深嵌套 | 编译慢 + 难懂 | 拆分工具类型 |
| `@ts-ignore` 滥用 | 错误掩盖 | `@ts-expect-error` + 注释 |
| 第三方库没类型 | any 污染 | @types/* 或自己写 .d.ts |
| enum 滥用 | 编译产物大 | 用 as const + 联合类型 |
| 嵌套对象字面量改属性 | TS 报错 | 类型允许或拷贝 |
| 函数返回类型未标注 | 推断可能变化 | 显式标注 |

## 8.16 实战项目

### 🎯 项目 1: 类型体操工具集
要求:
- 实现 DeepPartial、DeepReadonly、DeepPick
- 实现 Promise.allSettled 返回类型
- 实现 Path 类型(点路径对象属性)
- 实现类型级事件总线

### 🎯 项目 2: 类型安全的 API SDK
要求:
- 完整 OpenAPI → TypeScript 代码生成
- 类型安全的 URL/Params/Body
- 泛型推导响应类型
- 错误归一化类型

### 🎯 项目 3: React 组件库(全 TS)
要求:
- 10+ 组件,全部泛型化
- 完整 Storybook
- 类型测试 (tsd / expect-type)
- 泛型 forwardRef

## ✅ 本章检查清单

- [ ] 基础类型、联合/交叉、字面量类型熟练
- [ ] 类型守卫 4 种方式能用
- [ ] 泛型约束、infer、映射类型能写
- [ ] Promise.allSettled 的类型能推导
- [ ] Branded Types / const 断言 / satisfies 用过
- [ ] .d.ts 能写
- [ ] React/Vue 中 TS 模式掌握
- [ ] 完成 3 个实战项目

**下一章:** → [09-Node-Fullstack.md](./09-Node-Fullstack.md)