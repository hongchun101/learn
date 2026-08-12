/**
 * 模块 3：高级类型
 *
 * 涵盖内容：
 *  - 映射类型
 *  - 条件类型与 `infer`
 *  - 模板字面量类型
 *  - 递归类型与延迟类型
 *  - `key remapping`（映射类型中的 `as` 子句）
 *  - 内置工具类型以及如何自行编写工具类型
 */

// ---------------------------------------------------------------------------
// 1. 映射类型——工具类型的基础
// ---------------------------------------------------------------------------

// 将每个属性设为可选。
export type MyPartial<T> = { [K in keyof T]?: T[K] };

// 将每个属性设为必需。
export type MyRequired<T> = { [K in keyof T]-?: T[K] };

// 将所有内容设为 readonly。
export type MyReadonly<T> = { readonly [K in keyof T]: T[K] };

// 添加 `readonly` 标记过滤器——移除具有特定形态的属性。
export type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

// ---------------------------------------------------------------------------
// 2. 键重映射——映射类型中的 `as` 子句（TS 4.1+）
// ---------------------------------------------------------------------------

// Getters：将每个属性转换为返回该属性的函数。
export type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

export interface PersonShape {
  name: string;
  age: number;
}

export const personGetters: Getters<PersonShape> = {
  getName: () => 'Ada',
  getAge: () => 42,
};

// ---------------------------------------------------------------------------
// 3. 模板字面量类型——类型层面的字符串操作
// ---------------------------------------------------------------------------

export type EventName<TKind extends string> = `on${Capitalize<TKind>}`;
export type CssValue = `${number}${'px' | 'rem' | 'em' | '%'}`;
export type ApiPath = `/api/${string}`;

// 类型层面的断言，导出后供测试验证。
export type _EventNameCheck = EventName<'click'>; // "onClick"
export type _CssValueCheck = CssValue;            // `${number}${'px' | 'rem' | 'em' | '%'}`
export type _ApiPathCheck = ApiPath;              // `/api/${string}`

// ---------------------------------------------------------------------------
// 4. 条件类型与 `infer`
// ---------------------------------------------------------------------------

// 提取 await 后的类型（复现 Awaited<> 的语义）。
export type MyAwaited<T> = T extends Promise<infer Inner>
  ? Inner extends Promise<unknown>
    ? MyAwaited<Inner>
    : Inner
  : T;

// 提取返回类型。
export type MyReturnType<T> = T extends (...args: never[]) => infer R ? R : never;

// 提取第一个参数。
export type MyFirstArg<T> = T extends (first: infer F, ...rest: never[]) => unknown ? F : never;

// ---------------------------------------------------------------------------
// 5. 分布式条件类型
// ---------------------------------------------------------------------------

// 当 T 是裸类型参数时，`T extends U` 会分布到联合类型的各成员上。
export type ToPromise<T> = T extends unknown ? Promise<T> : never;

// 移除 null 和 undefined。
export type NonNullableDeep<T> = T extends NonNullable<T> ? T : never;

// ---------------------------------------------------------------------------
// 6. 递归类型——类型层面的 JSON
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

// ---------------------------------------------------------------------------
// 7. 延迟条件类型——对元组形态进行模式匹配
// ---------------------------------------------------------------------------

export type Reverse<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Tail extends readonly unknown[]
    ? [...Reverse<Tail>, Head]
    : never
  : [];

export type _ReverseCheck = Reverse<[1, 2, 3]>; // [3, 2, 1]

// ---------------------------------------------------------------------------
// 8. `as const` + satisfies——精确类型模式
// ---------------------------------------------------------------------------

export interface Route {
  readonly path: `/${string}`;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly auth: boolean;
}

// `satisfies` 既保留字面量类型，又确保满足约定。
export const routes = {
  listUsers: { path: '/users', method: 'GET', auth: true },
  createUser: { path: '/users', method: 'POST', auth: true },
  deleteUser: { path: '/users/:id', method: 'DELETE', auth: true },
  health: { path: '/health', method: 'GET', auth: false },
} as const satisfies Record<string, Route>;

// 由于使用了 `as const`，`routes.listUsers.method` 是字面量 'GET'，而不是联合类型。
// 同时还会根据 `Record<string, Route>` 对 `routes` 进行完整检查。
export type _RoutesMethod = (typeof routes)['listUsers']['method']; // "GET"

// ---------------------------------------------------------------------------
// 9. 索引访问类型——`T[K]` 和 `T[K1 | K2]`
// ---------------------------------------------------------------------------

export type ValueOf<T> = T[keyof T];

export const routesHealth: ValueOf<typeof routes> = routes.health;

// ---------------------------------------------------------------------------
// 10. `Opaque` 及相关类型——防止意外混用
// ---------------------------------------------------------------------------

export type Opaque<T, K extends symbol> = T & { readonly [k in K]: never };
export const MetersBrand: unique symbol = Symbol('Meters');
export const SecondsBrand: unique symbol = Symbol('Seconds');
export type Meters = Opaque<number, typeof MetersBrand>;
export type Seconds = Opaque<number, typeof SecondsBrand>;

export const meters = (n: number): Meters => n as Meters;
export const seconds = (n: number): Seconds => n as Seconds;

// 编译错误：不能将 Meters 与 Seconds 相加。
// const _bad: number = meters(1) + seconds(1);

if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('routes keys =', Object.keys(routes));
}

// ---------------------------------------------------------------------------
// 11. 模板字面量 DSL —— 用类型层表达小型领域语言
// ---------------------------------------------------------------------------
//
// 把模板字面量、infer 与映射类型组合，可以在类型层实现一个迷你解析器：
// 给定路径字面量，提取出参数键、参数值类型，并构造一个强类型的
// `buildUrl(path, params)` 函数。
//
// 这是设计 tRPC、Hono、Zod 的 path API 时的核心套路。

// 1) 解析 `:foo` 与 `*` 通配符。
export type RouteParam<S extends string> = S extends `:${infer P}` ? P : S extends `*` ? 'wildcard' : never;

export type RouteParams<S extends string> = S extends `${string}:${infer P}` ? P : never;

// 2) 给定一个具体路径，提取参数。
export type ExtractParams<P extends string> = P extends `${string}:${infer K}/${infer R}`
  ? { [Q in K | keyof ExtractParams<`/${R}`>]: string }
  : P extends `${string}:${infer K}`
    ? { [Q in K]: string }
    : Record<never, never>;

// 3) 强类型的 builder：参数必须按名提供。
export function buildUrl<P extends string>(path: P, params: ExtractParams<P>): string {
  return (path as string).replace(/:([A-Za-z]+)/g, (_, k: string) => String((params as Record<string, string>)[k] ?? ''));
}

// 演示：
//   type P = ExtractParams<'/users/:id/posts/:postId'>;
//   //   ^? { id: string; postId: string }
export type _UserPostParams = ExtractParams<'/users/:id/posts/:postId'>;

// 4) 枚举合法的 HTTP 方法。
export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// 5) 强类型的事件总线：把事件名映射到 payload 形状。
export type EventPayloads<Name extends string> = Name extends `${string}:${string}` ? { readonly [K in Name]: unknown } : never;

// 6) `Uppercase` / `Lowercase` / `Capitalize` / `Uncapitalize` 的内建支持。
export type RouteName<S extends string> = Capitalize<S>;
