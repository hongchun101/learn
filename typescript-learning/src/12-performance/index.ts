/**
 * 模块 12：性能与编译器内部机制
 *
 * 涵盖内容：
 *  - `const` 类型参数（TS 5.0+）— 捕获最具体的字面量类型
 *  - 控制流分析与类型收窄
 *  - 断言函数：`asserts`、`asserts x is T`
 *  - `satisfies` 运算符：在满足约束的同时保留窄类型推断
 *  - `as` 逃生舱（谨慎使用，并说明理由）
 *  - TS 编译器内部机制：结构类型、类型擦除、健全性
 *  - 常见陷阱：`null` 与 `undefined`、可选属性与 `| undefined`、
 *    `exactOptionalPropertyTypes`
 *  - 性能：类型实例化深度、TS 服务器内存
 */
// （本模块无需导入值）

// ---------------------------------------------------------------------------
// 1. `const` 类型参数（TS 5.0+）
// ---------------------------------------------------------------------------

// 如果没有 `const`，`args` 会被推断为 `string[]`，而字面量
// 类型将会丢失。
export function tuple<const T extends readonly unknown[]>(...args: T): T {
  return args;
}

export const tConst1 = tuple('a', 'b', 'c'); // 类型：readonly ["a", "b", "c"]
export const tConst2 = tuple(1, true, 'x'); // 类型：readonly [1, true, "x"]

// `const` 修饰符针对单个参数：
//   function f<const T>(x: T) { ... }
//   function g<T>(x: T) { ... }  // T 会被拓宽

// ---------------------------------------------------------------------------
// 2. 断言函数
// ---------------------------------------------------------------------------

// `asserts cond` — 收窄作用域其余部分的类型。
export function assertDefined<T>(value: T | null | undefined, msg = 'expected defined'): asserts value is T {
  if (value === null || value === undefined) throw new Error(msg);
}

// `asserts value is T` — 收窄为特定类型。
export function assertIsString(x: unknown): asserts x is string {
  if (typeof x !== 'string') throw new TypeError('not a string');
}

// 演示：
export function demo(x: unknown): string {
  assertIsString(x);
  return x.toUpperCase(); // 此处 x 为 `string`
}

// ---------------------------------------------------------------------------
// 3. `satisfies` 运算符（TS 4.9+）
// ---------------------------------------------------------------------------

interface Color {
  readonly hex: `#${string}`;
  readonly name: string;
}

// 如果没有 `satisfies`，就必须二选一：收窄字面量类型，或满足约束。
// `satisfies` 两者兼顾：根据 `Color` 进行检查，同时保留字面量类型。
export const palettes = {
  red: { hex: '#ff0000', name: 'Red' },
  green: { hex: '#00ff00', name: 'Green' },
  blue: { hex: '#0000ff', name: 'Blue' },
} as const satisfies Record<string, Color>;

// `palettes.red.hex` 是字面量 '#ff0000'，而不是 `string`。
// `palettes.red` 会根据 `Color` 进行检查。

// ---------------------------------------------------------------------------
// 4. 结合 `typeof` 使用 `keyof` 进行安全查找
// ---------------------------------------------------------------------------

const config = {
  api: 'https://api.example.com',
  retries: 3,
  debug: false,
} as const;

type Config = typeof config;
type ConfigKey = keyof Config; // "api" | "retries" | "debug"

function getConfig<K extends ConfigKey>(key: K): Config[K] {
  return config[key];
}

export const apiUrl: 'https://api.example.com' = getConfig('api');

// ---------------------------------------------------------------------------
// 5. 控制流分析
// ---------------------------------------------------------------------------

// TS 会根据赋值、条件分支和类型守卫进行类型收窄。
export function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return v.toString();
  if (Array.isArray(v)) return v.map(stringify).join(',');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// 使用 `in` 对带标签联合进行类型收窄（另见模块 01）。
export function handleInput(x: { kind: 'a'; a: number } | { kind: 'b'; b: string }): string {
  if (x.kind === 'a') return `a=${x.a}`;
  return `b=${x.b}`;
}

// ---------------------------------------------------------------------------
// 6. `exactOptionalPropertyTypes` — 对 `?` 最严格的解释
// ---------------------------------------------------------------------------

// 启用此选项后：
//   interface R { x?: number }
//   const r1: R = {};            // 正确
//   const r2: R = { x: undefined }; // 错误 — 必须省略，不能赋值为 undefined
//   const r3: R = { x: 1 };      // 正确

// 如果希望允许 undefined 作为值，请写成：
//   interface R { x?: number | undefined }

// ---------------------------------------------------------------------------
// 7. 性能：控制流与类型收窄
// ---------------------------------------------------------------------------

// 常见的性能瓶颈：链式 `as` 类型转换会破坏类型收窄，迫使 TS 重复遍历
// 联合类型。应让类型守卫完成这项工作。

interface Slow {
  kind: 'slow';
  data: string;
}
interface Fast {
  kind: 'fast';
  data: number;
}
type Maybe = Slow | Fast;

export function getData(m: Maybe): string {
  if (m.kind === 'slow') return m.data;
  return m.data.toString();
}

// ---------------------------------------------------------------------------
// 8. 可辨识元组类型
// ---------------------------------------------------------------------------

// `Promise.all` 会根据输入元组推断元组类型。
//   const [a, b] = await Promise.all([fetchA(), fetchB()]);
//   // a: Awaited<ReturnType<typeof fetchA>>  b: ...

// ---------------------------------------------------------------------------
// 9. 使用 isolatedModules 时仅类型导入的正确写法
// ---------------------------------------------------------------------------

// 正确写法：
import type { Result as _R } from '../01-basics/index.js';
export type UseResult = _R<number, Error>;

// ---------------------------------------------------------------------------
// 10. 编译器内部机制：结构类型与擦除
// ---------------------------------------------------------------------------

// TypeScript 使用结构类型，而非名义类型。两个形状相同的类型可以
// 互换 — 这正是 `Brand<T, K>` 存在的原因（它添加一个幻象
// 属性，使类型在名义上有所区别）。
//
// 擦除：类型在运行时并不存在。品牌类型和幻象类型
// 不会产生运行时开销。

// ---------------------------------------------------------------------------
// 11. 递归类型深度限制
// ---------------------------------------------------------------------------

// TS 5.x 提高了限制，但深度递归的条件类型仍可能
// 触发“类型实例化过深且可能无限”的错误。
// 缓解方法：
//   - 使用有界递归（例如，在每一步裁剪元组类型）。
//   - 将辅助类型提升到递归分支之外。
//   - 通过映射类型进行缓存。

// 有界递归示例：
type Reverse<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? R extends readonly unknown[]
    ? [...Reverse<R>, H]
    : []
  : [];

export const reverseExample: Reverse<[1, 2, 3, 4, 5]> = [5, 4, 3, 2, 1];

// ---------------------------------------------------------------------------
// 12. 健全性陷阱
// ---------------------------------------------------------------------------

// `as` 不会验证任何内容。在边界处应优先使用类型守卫/schema。
// 一个常见陷阱：使用 `string` 建立索引时会返回 `T`（而不是 `T | undefined`），
//   除非启用 `noUncheckedIndexedAccess`。
//   启用后，索引操作总是返回 `T | undefined`。

// ---------------------------------------------------------------------------
// 13. `Object.freeze`、`Object.keys` 与 readonly
// ---------------------------------------------------------------------------

// `as const` 是类型级冻结；`Object.freeze` 是运行时冻结。
export const frozen = Object.freeze({ a: 1, b: 'x' });
// frozen.a = 2; // 运行时触发 TypeError，编译时产生类型错误。

// `Object.keys` 返回 `string[]`，而非 `(keyof T)[]` — 请使用带类型的包装函数：
export function typedKeys<T extends object>(o: T): (keyof T)[] {
  return Object.keys(o) as (keyof T)[];
}

// ---------------------------------------------------------------------------
// 14. `Readonly<T>` 与 `ReadonlyArray<T>`
// ---------------------------------------------------------------------------

// `Readonly<T>` 将所有属性设为 readonly（浅层）。
// `ReadonlyArray<T>` 是不可变的数组视图。
export const readonlyArr: ReadonlyArray<number> = [1, 2, 3];
// readonlyArr.push(4); // 编译错误：ReadonlyArray 上不存在 push

// ---------------------------------------------------------------------------
// 15. `Map` / `Set` 类型标注
// ---------------------------------------------------------------------------

export const stringNumberMap: Map<string, number> = new Map();
stringNumberMap.set('a', 1);
export const mapGetResult: number | undefined = stringNumberMap.get('a');

// ---------------------------------------------------------------------------
// 16. `Record<K, V>` 与 `Partial<Record<K, V>>`
// ---------------------------------------------------------------------------

export type Flags = Record<'dark' | 'compact' | 'experimental', boolean>;
export const featureFlags: Flags = { dark: true, compact: false, experimental: false };

// ---------------------------------------------------------------------------
// 17. `Awaited<T>` 与 `ReturnType<T>` — 内置类型
// ---------------------------------------------------------------------------

export type AsyncReturn = Awaited<ReturnType<typeof fetch>>;

// ---------------------------------------------------------------------------
// 演示
// ---------------------------------------------------------------------------

if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('stringify(1) =', stringify(1));
  console.info('typedKeys =', typedKeys({ a: 1, b: 2 }));
}
