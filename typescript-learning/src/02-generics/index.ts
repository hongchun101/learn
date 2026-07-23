/**
 * 模块 2：泛型
 *
 * 内容涵盖：
 *  - 泛型函数、类、接口
 *  - 约束：`extends` 关键字、`keyof`、条件约束
 *  - 默认类型参数
 *  - 变型：协变、逆变、双变、不变
 *  - 双变技巧与 `--strictFunctionTypes` / `strictFunctionTypes`
 *  - 从调用点推断、手动指定、上下文类型推断
 *  - 通过类型层模拟实现的高阶类型（TS 实际上无法实现真正的 HKT）
 *  - 幻影类型
 */

// ---------------------------------------------------------------------------
// 1. 带约束的泛型接口
// ---------------------------------------------------------------------------

export interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | undefined>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

// `keyof` 约束 —— 取 T 中值类型满足 V 的键。
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

// 由泛型派生的映射类型 —— 使用 keyof 进行严格的查找。
export function get<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// ---------------------------------------------------------------------------
// 2. 默认类型参数以及对 `noUncheckedIndexedAccess` 友好的 API
// ---------------------------------------------------------------------------

export interface ApiResponse<TData, TError = ApiError> {
  status: number;
  data: TData | null;
  error: TError | null;
}

export interface ApiError {
  code: string;
  message: string;
}

export async function fetchJson<TData, TError = ApiError>(
  url: string,
  init: RequestInit = {},
): Promise<ApiResponse<TData, TError>> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const error = (await res.json().catch(() => ({ code: 'UNKNOWN', message: res.statusText }))) as TError;
    return { status: res.status, data: null, error };
  }
  const data = (await res.json()) as TData;
  return { status: res.status, data, error: null };
}

// ---------------------------------------------------------------------------
// 3. 变型：函数参数为逆变，返回值为协变
// ---------------------------------------------------------------------------

// 为任意 T 产生一个 `Box<T>` —— 关于 T 是协变的。
export interface Box<out T> {
  readonly value: T;
}

export const box = <T>(value: T): Box<T> => ({ value });
// Consumer 是逆变的：它消费 T。
export interface Consumer<in T> {
  consume(value: T): void;
}

export const stringConsumer: Consumer<string> = { consume: (v) => console.info('got', v) };
// `Consumer<unknown>` 不能赋值给 `Consumer<string>`（逆变性）。
//   const wider: Consumer<unknown> = stringConsumer; // 编译错误
// `Consumer<Animal>` 可以赋值给 `Consumer<Dog>`（消费者的具体度更低）。
const narrower: Consumer<'a' | 'b' | 'c'> = stringConsumer;
void narrower;

// ---------------------------------------------------------------------------
// 4. 方法的双变与严格函数类型
// ---------------------------------------------------------------------------

// 在 `strictFunctionTypes: true` 下，下面的赋值会失败：
//   let f: (x: Animal) => void = (x: Dog) => void; // 不健全，将报错。
// 使用方法简写声明的方法出于历史原因保持双变。
export interface Animal {
  name: string;
}
export interface Dog extends Animal {
  bark(): void;
}

// ---------------------------------------------------------------------------
// 5. 幻影类型 —— 携带一个在运行时无实际表现，仅在类型层存在的标签
// ---------------------------------------------------------------------------

// 常见用例：品牌化 ID / 状态机。
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, 'UserId'>;
export type OrderId = Brand<string, 'OrderId'>;

export const userId = (s: string): UserId => s as UserId;
export const orderId = (s: string): OrderId => s as OrderId;

// 编译期错误：不能把 OrderId 传给期望 UserId 的位置。
// const _bad: UserId = orderId('o-1');

// ---------------------------------------------------------------------------
// 6. 条件类型推断 —— 通过条件类型构造一个 “Last” 类型
// ---------------------------------------------------------------------------

export type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never;

export type _LastNum = Last<[1, 2, 3]>; // number
export type _LastStr = Last<['a', 'b', 'c']>; // "c"

// ---------------------------------------------------------------------------
// 7. 泛型位置的元组风格 rest
// ---------------------------------------------------------------------------

export function tuple<T extends readonly unknown[]>(...args: T): T {
  return args;
}

// ---------------------------------------------------------------------------
// 8. 类型层排序（展示条件类型 + infer 的完整威力）
// ---------------------------------------------------------------------------

export type Length<T extends readonly unknown[]> = T['length'];

export type GreaterThan<A extends number, B extends number> = BuildTuple<A> extends [
  ...BuildTuple<B>,
 ...infer _,
]
  ? _['length'] extends 0
    ? false
    : true
  : false;

type BuildTuple<L extends number, Acc extends unknown[] = []> = Acc['length'] extends L
  ? Acc
  : BuildTuple<L, [unknown, ...Acc]>;

// 编译期检查：5 > 3 为 true，2 > 4 为 false。
type _GtCheck1 = GreaterThan<5, 3>; // true
type _GtCheck2 = GreaterThan<2, 4>; // false
void (0 as unknown as _GtCheck1);
void (0 as unknown as _GtCheck2);
