/**
 * 模块 7：类型级编程
 *
 * 涵盖内容：
 *  - 类型级元组操作
 *  - 类型级自然数、算术和比较
 *  - 路径导航类型：`Get<T, 'a.b.c'>`
 *  - 类型级字符串操作（Split、Join）
 *  - 类型状态机（将状态编码进类型）
 *  - 累积字面量类型的构建器模式
 *  - 通过带有种类标签的接口模拟 HKT
 *
 * 本模块的要点：TS 的类型系统是一个微型 lambda 演算系统。
 * 将它发挥到极致，使不可能的状态无法表示。
 */

// ---------------------------------------------------------------------------
// 1. 元组操作
// ---------------------------------------------------------------------------

export type Length<T extends readonly unknown[]> = T['length'];

export type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]] ? H : never;

export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];

export type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never;

export type Concat<A extends readonly unknown[], B extends readonly unknown[]> = [...A, ...B];

export type Reverse<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? R extends readonly unknown[]
    ? [...Reverse<R>, H]
    : never
  : [];

export type Zip<A extends readonly unknown[], B extends readonly unknown[]> = A extends readonly [infer AH, ...infer AR]
  ? B extends readonly [infer BH, ...infer BR]
    ? AR extends readonly unknown[]
      ? BR extends readonly unknown[]
        ? [[AH, BH], ...Zip<AR, BR>]
        : never
      : never
    : []
  : [];

// ---------------------------------------------------------------------------
// 2. 类型级自然数
// ---------------------------------------------------------------------------

// 构建长度为 N 的元组（上限约为 30，以免触及 TS 递归限制）。
type BuildTuple<L extends number, Acc extends unknown[] = []> = Acc['length'] extends L
  ? Acc
  : BuildTuple<L, [unknown, ...Acc]>;
export type Inc<N extends number> = [...BuildTuple<N>, unknown]['length'];
export type Dec<N extends number> = BuildTuple<N> extends readonly [unknown, ...infer R] ? R['length'] : 0;
export type Add<A extends number, B extends number> = [...BuildTuple<A>, ...BuildTuple<B>]['length'];
export type Sub<A extends number, B extends number> = BuildTuple<A> extends [...BuildTuple<B>, ...infer R]
  ? R['length']
  : 0;
// ---------------------------------------------------------------------------
// 3. 类型级比较
// ---------------------------------------------------------------------------
export type IsZero<N extends number> = N extends 0 ? true : false;
export type GreaterThan<A extends number, B extends number> = BuildTuple<A> extends [
  ...BuildTuple<B>,
  ...infer _,
]
  ? _['length'] extends 0
    ? false
    : true
  : false;
export type LessThan<A extends number, B extends number> = GreaterThan<B, A>;
export type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---------------------------------------------------------------------------
// 4. 路径导航：`Get<T, 'a.b.c'>`
// ---------------------------------------------------------------------------

export type Get<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? Get<T[Head], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

interface Config {
  server: { host: string; port: number; tls: { enabled: boolean; cert?: string } };
  db: { url: string; pool: number };
}

export type _HostType = Get<Config, 'server.host'>; // string
export type _PortType = Get<Config, 'server.port'>; // number
export type _TlsEnabled = Get<Config, 'server.tls.enabled'>; // boolean

// 路径写入 Set — 留作练习：这是常见的面试题。
// type Set<T, P extends string, V> = { ... } — 沿路径局部修改；其余属性使用展开语法。

// ---------------------------------------------------------------------------
// 5. 类型级字符串操作
// ---------------------------------------------------------------------------

export type Split<S extends string, D extends string> = S extends `${infer Head}${D}${infer Tail}`
  ? [Head, ...Split<Tail, D>]
  : [S];

export type Join<S extends readonly string[], D extends string> = S extends readonly [
  infer Head extends string,
  ...infer Rest extends string[],
]
  ? Rest extends []
    ? Head
    : `${Head}${D}${Join<Rest, D>}`
  : '';

export const splitExample: Split<'a.b.c', '.'> = ['a', 'b', 'c'];
export const joinExample: Join<['x', 'y', 'z'], '-'> = 'x-y-z';

// ---------------------------------------------------------------------------
// 6. 类型状态机
// ---------------------------------------------------------------------------

// 连接状态编码在其类型中。
// 只能调用对当前状态有效的方法。
export interface Disconnected {
  readonly status: 'disconnected';
}
export interface Connecting {
  readonly status: 'connecting';
}
export interface Connected {
  readonly status: 'connected';
  readonly sessionId: string;
}
export interface Failed {
  readonly status: 'failed';
  readonly reason: string;
}

export type ConnState = Disconnected | Connecting | Connected | Failed;

export interface Conn<S extends ConnState> {
  state: S;
}

export function connect(_c: Conn<Disconnected>): Conn<Connecting> {
  return { state: { status: 'connecting' } };
}

export function ready(c: Conn<Connecting>, sessionId: string): Conn<Connected> {
  if (c.state.status !== 'connecting') throw new Error('unreachable');
  return { state: { status: 'connected', sessionId } };
}

export function fail(c: Conn<Connecting>, reason: string): Conn<Failed> {
  if (c.state.status !== 'connecting') throw new Error('unreachable');
  return { state: { status: 'failed', reason } };
}

// 不能对 `Conn<Disconnected>` 调用 `ready`，否则会产生编译错误。

// ---------------------------------------------------------------------------
// 7. 累积字面量的构建器
// ---------------------------------------------------------------------------

// 每个方法都向字符串字面量联合中追加一个键，因此最终
// `result` 会知晓所有已设置的键。
export class EventBuilder<Keys extends string = never> {
  private handlers: Partial<Record<string, () => void>> = {};
  private _keys: Keys[] = [];

  on<K extends string>(event: K, handler: () => void): EventBuilder<Keys | K> {
    this.handlers[event] = handler;
    (this._keys as string[]).push(event);
    return this as unknown as EventBuilder<Keys | K>;
  }
  has<K extends string>(event: K): this is EventBuilder<Keys | (Keys & K)> {
    return event in this.handlers;
  }
  fire<K extends Keys>(event: K): void {
    this.handlers[event]?.();
  }
  listEvents(): readonly Keys[] {
    return this._keys;
  }
}

// ---------------------------------------------------------------------------
// 8. HKT 模拟
// ---------------------------------------------------------------------------

// TS 没有真正的 HKT。这里使用 `Kind` 接口和应用操作来模拟它们。
export interface Kind<F, A> {
  readonly _f: F;
  readonly _a: A;
}

export interface ArrayF extends Kind<ArrayF, never> {
  // 标记
}
export interface OptionF extends Kind<OptionF, never> {}

export interface MapF<F, A, B> {
  <X>(fa: Kind<F, A> & { value: X }): Kind<F, B> & { value: X };
}

// 一个用于 Functor 的微型“类型类”：真正的 HKT 能让我们以泛型方式编写它。
// `F` 参数是幻象参数：该类型类以 F 为键，但这里的方法
// 操作底层的 { value } 容器，因此我们接受该参数但忽略它。
export interface FunctorOps<F> {
  map<A, B>(fa: { value: A }, f: (a: A) => B): { value: B };
  readonly _phantom?: F;
}

export const arrayFunctor: FunctorOps<ArrayF> = {
  map: (fa, f) => ({ value: f((fa as unknown as { value: unknown }).value as never) }),
};

// ---------------------------------------------------------------------------
// 9. 类型级排序（示例性，存在上限）
// ---------------------------------------------------------------------------

export type Sort<T extends readonly number[]> = T extends readonly [
  infer H extends number,
  ...infer Rest extends number[],
]
  ? Insert<H, Sort<Rest>>
  : [];

type Insert<N extends number, T extends readonly number[]> = T extends readonly [
  infer H extends number,
  ...infer Rest extends number[],
]
  ? LessThan<N, H> extends true
    ? [N, H, ...Rest]
    : [H, ...Insert<N, Rest>]
  : [N];

export const sortedExample: Sort<[3, 1, 4, 1, 5, 9, 2, 6]> = [1, 1, 2, 3, 4, 5, 6, 9];
