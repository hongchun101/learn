/**
 * 模块 1：类型系统基础
 *
 * 内容涵盖：
 *  - 原始类型、字面量类型、加宽与收窄
 *  - 联合类型与交叉类型
 *  - 类型守卫（typeof、instanceof、in、等值判断、自定义谓词）
 *  - 可辨识联合（标签联合）—— TS 领域建模的主力
 *  - 使用 `assertNever` 进行穷尽性检查
 */

// ---------------------------------------------------------------------------
// 1. 字面量类型与 `as const`
// ---------------------------------------------------------------------------
// `const` 给出不会发生加宽的字面量类型。
// 下面三个示例演示了加宽与字面量类型的区别。
// 我们将它们导出，以便使用方与测试都能观察这些类型断言。
export const literalHello = 'hello'; // 类型："hello"
export let widenedHello = 'hello'; // 类型：string（已加宽）
export let narrowed: 'hello' | 'world' = 'hello';

// `as const` 会生成只读的深度字面量类型。
export const config = {
  api: { baseUrl: 'https://api.example.com', timeoutMs: 3000 },
  features: { retry: true, debug: false },
} as const;
export type Config = typeof config;
export const cfgCheck: Config['api']['baseUrl'] = 'https://api.example.com';

// ---------------------------------------------------------------------------
// 2. 可辨识联合（TS 最有用的模式）
// ---------------------------------------------------------------------------

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// 构造函数是稳定的公共 API：应保留具名导出。
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// 自定义抛错 —— 应区分异常类型，而不是直接 `throw r.error`。
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(String(r.error));
}

// `map` 是代数意义上的 Functor map：签名就是契约，应保留具名导出。
export function map<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

// 3. 穷尽性检查 —— 类型系统的安全网
// ---------------------------------------------------------------------------

export type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; width: number; height: number }
  | { kind: 'triangle'; base: number; height: number };

// 公开契约：调用方可在 default 分支内调用 assertNever(x)。
export function assertNever(x: never): never {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(x)}`);
}

export function area(s: Shape): number {
  switch (s.kind) {
    case 'circle':
      return Math.PI * s.radius * s.radius;
    case 'rect':
      return s.width * s.height;
    case 'triangle':
      return (s.base * s.height) / 2;
    default:
      return assertNever(s); // 如果新增 kind 而未补充对应 case，将产生编译错误
  }
}

// 4. 用户自定义类型守卫
// ---------------------------------------------------------------------------

export interface User {
  readonly id: string;
  readonly email: string;
  readonly role: 'admin' | 'member';
}

// 类型守卫 —— 收窄契约：本函数必须保持函数形式。
export function isUser(x: unknown): x is User {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r['id'] === 'string' &&
    typeof r['email'] === 'string' &&
    (r['role'] === 'admin' || r['role'] === 'member')
  );
}

// ---------------------------------------------------------------------------
// 5. `in` 运算符的收窄
// ---------------------------------------------------------------------------

export type Event =
  | { type: 'login'; userId: string }
  | { type: 'logout'; userId: string }
  | { type: 'purchase'; userId: string; sku: string; amount: number };

export function handleEvent(e: Event): string {
  if ('sku' in e) return `${e.userId} bought ${e.sku} for ${e.amount}`;
  if ('userId' in e) return `auth event: ${e.type}`;
  return assertNever(e);
}

// 演示入口
if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('area(circle r=2) =', area({ kind: 'circle', radius: 2 }));
  console.info('unwrap(ok(7)) =', unwrap(ok(7)));
  console.info('handleEvent =', handleEvent({ type: 'purchase', userId: 'u1', sku: 'X', amount: 9.99 }));
}
