# TypeScript 速查

## 基础类型
```typescript
let str: string = 'hi';
let num: number = 42;
let bool: boolean = true;
let big: bigint = 100n;
let sym: symbol = Symbol('x');
let n: null = null;
let u: undefined = undefined;

let literal: 'a' | 'b' | 'c' = 'a';
let status: 200 | 404 | 500;
```

## 对象
```typescript
interface User {
  id: number;
  name: string;
  email?: string;
  readonly createdAt: Date;
}

type Point = { x: number; y: number };

// interface 可声明合并、可 extends
// type 可联合/交叉、可映射
```

## 数组与元组
```typescript
let arr: number[] = [1, 2];
let arr2: Array<string> = ['a'];
let pair: [string, number] = ['x', 1];
let opt: [string, number?] = ['x'];
let rest: [string, ...number[]] = ['x', 1, 2];
let ro: ReadonlyArray<number> = [1, 2];
let rot: readonly [string, number] = ['x', 1];
```

## 函数
```typescript
function fn(a: number, b: number = 0, ...rest: any[]): number {
  return a + b;
}

type Add = (a: number, b: number) => number;

// 重载
function parse(s: string): string;
function parse(n: number): number;
function parse(x: string | number): string | number {
  return typeof x === 'string' ? x : x;
}

// this 类型
interface Obj {
  fn(this: Obj): void;
}
```

## 联合 / 交叉
```typescript
type A = { a: string };
type B = { b: number };
type AB = A & B;  // { a, b }

type Status = 'idle' | 'loading' | 'success' | 'error';

// 区分联合
type Shape =
  | { kind: 'circle'; r: number }
  | { kind: 'square'; size: number };

function area(s: Shape) {
  switch (s.kind) {
    case 'circle': return Math.PI * s.r ** 2;
    case 'square': return s.size ** 2;
  }
}
```

## 类型守卫
```typescript
typeof x === 'string'
x instanceof Date
'prop' in obj
function isString(x: unknown): x is string {
  return typeof x === 'string';
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
```

## 泛型
```typescript
function id<T>(value: T): T { return value; }

function get<T extends object, K extends keyof T>(o: T, k: K): T[K] {
  return o[k];
}

type Api<T = unknown> = { data: T };

// 默认类型
type WithDefaults<T> = Required<Partial<T>>;
```

## 工具类型
```typescript
Partial<T>            // 全部可选
Required<T>           // 全部必选
Readonly<T>           // 全部只读
Pick<T, K>            // 选属性
Omit<T, K>            // 去属性
Exclude<T, U>         // 排除联合
Extract<T, U>         // 提取联合
NonNullable<T>        // 去 null/undefined
Record<K, V>          // 键值映射
Parameters<T>         // 函数参数
ReturnType<T>         // 函数返回值

// 自定义
type Nullable<T> = T | null;
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;
```

## 条件类型与 infer
```typescript
type IsString<T> = T extends string ? true : false;

type Unwrap<T> = T extends Promise<infer U> ? U : T;
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
type FirstArg<T> = T extends (first: infer F, ...rest: any[]) => any ? F : never;

// Promise.all 类型
type PromiseAll<T extends readonly unknown[]> = {
  [K in keyof T]: Awaited<T[K]>;
};
```

## 映射类型
```typescript
type Readonly2<T> = { readonly [P in keyof T]: T[P] };
type Optional2<T> = { [P in keyof T]?: T[P] };

type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type PickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};
```

## 模板字面量
```typescript
type Event = 'click' | 'focus' | 'blur';
type Handler = `on${Capitalize<Event>}`;
// 'onClick' | 'onFocus' | 'onBlur'
```

## 实用技巧
```typescript
// Branded Types
type Brand<T, B> = T & { __brand: B };
type UserId = Brand<string, 'UserId'>;

// const 断言
const arr = [1, 2] as const;   // readonly [1, 2]
const config = { api: '/api' } as const;

// satisfies (4.9+)
const cfg = {
  api: '/api',
} satisfies Record<string, unknown>;
// 类型保留字面量

// indexed access
type Names = User['name'];

// keyof
type Keys = keyof User;
```

## React TS
```tsx
type Props = { userId: string; show?: boolean };

const Component: FC<Props> = ({ userId, show = false }) => { /* ... */ };

// 泛型组件
type ListProps<T> = { items: T[]; renderItem: (item: T) => ReactNode };
function List<T>({ items, renderItem }: ListProps<T>) { /* ... */ }

// forwardRef
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <input ref={ref} {...props} />
));

// useState
const [user, setUser] = useState<User | null>(null);

// useRef
const ref = useRef<HTMLInputElement>(null);
```

## 配置
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["src/*"] }
  }
}
```