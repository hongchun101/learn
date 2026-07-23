/**
 * 模块 11：模式
 *
 * 内容涵盖：
 *  - 类型状态机：将状态编码进类型，使非法状态转移成为编译错误。
 *  - 流式 / 构建器 API，只有在配置完全合法时才允许调用 `build()`。
 *  - 使用泛型接口实现的 Repository 模式。
 *  - 使用映射事件名进行类型化的 Observer / 事件发射器。
 *  - 智能构造函数 + 名义类型。
 *  - 通过可辨识联合实现的“命令模式”。
 *  - 使用可辨识分派实现的访问者模式。
 *  - 用于异步编排的 Saga 模式。
 */

import { assertNever, ok, err } from '../01-basics/index.js';
import type { Result } from '../01-basics/index.js';

// ---------------------------------------------------------------------------
// 1. 类型状态机（穷尽式）
// ---------------------------------------------------------------------------

export type ConnectionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'connecting'; readonly since: Date }
  | { readonly kind: 'open'; readonly since: Date; readonly peer: string }
  | { readonly kind: 'closed'; readonly since: Date; readonly reason: 'normal' | 'error' };

// `S extends ConnectionState` 参数将状态固定到具体的 kind。
// 方法签名通过 S 约束 `this`，从而强制下一个状态的合法性。
export class Connection<S extends ConnectionState = ConnectionState> {
  private constructor(public readonly state: S) {}
  static idle(): Connection<{ kind: 'idle' }> {
    return new Connection<{ kind: 'idle' }>({ kind: 'idle' });
  }
  connect(this: Connection<{ kind: 'idle' }>): Connection<{ kind: 'connecting'; since: Date }> {
    return new Connection<{ kind: 'connecting'; since: Date }>({ kind: 'connecting', since: new Date() });
  }
  open(
    this: Connection<{ kind: 'connecting'; since: Date }>,
    peer: string,
  ): Connection<{ kind: 'open'; since: Date; peer: string }> {
    return new Connection<{ kind: 'open'; since: Date; peer: string }>({
      kind: 'open',
      since: new Date(),
      peer,
    });
  }
  close(
    this: Connection<{ kind: 'open'; since: Date; peer: string }>,
    reason: 'normal' | 'error' = 'normal',
  ): Connection<{ kind: 'closed'; since: Date; reason: 'normal' | 'error' }> {
    return new Connection<{ kind: 'closed'; since: Date; reason: 'normal' | 'error' }>({
      kind: 'closed',
      since: new Date(),
      reason,
    });
  }
  describe(this: Connection<ConnectionState>): string {
    switch (this.state.kind) {
      case 'idle':
        return 'idle';
      case 'connecting':
        return `connecting since ${this.state.since.toISOString()}`;
      case 'open':
        return `open to ${this.state.peer}`;
      case 'closed':
        return `closed (${this.state.reason})`;
      default:
        return assertNever(this.state);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. 通过字面量累积的构建器
// ---------------------------------------------------------------------------

// `Builder<Required, Optional>` 强制使用者必须提供声明为 `Required` 的键，
// 而 `Optional` 的键则可提供也可不提供。
export interface QueryParams {
  readonly limit: number;
  readonly offset: number;
  readonly sort?: 'asc' | 'desc';
  readonly fields?: readonly string[];
}

// 必填：在 .build() 成功之前必须提供 limit 和 offset。
// 可选：sort 和 fields 可按需提供；.build() 接受它们缺失的情况。
// （通过 QueryBuilder 上的 `Have` 泛型在类型层进行追踪。）
export type Required = 'limit' | 'offset';
export type Optional = 'sort' | 'fields';

// 内部可变的累积结构。我们仅对外暴露只读视图。
type MutableQueryParams = {
  -readonly [K in keyof QueryParams]: QueryParams[K];
};

export class QueryBuilder<Have extends string = never> {
  private readonly data: Partial<MutableQueryParams> = {};
  static start(): QueryBuilder<never> {
    return new QueryBuilder<never>();
  }
  limit(n: number): QueryBuilder<Have | 'limit'> {
    this.data.limit = n;
    return this as unknown as QueryBuilder<Have | 'limit'>;
  }
  offset(n: number): QueryBuilder<Have | 'offset'> {
    this.data.offset = n;
    return this as unknown as QueryBuilder<Have | 'offset'>;
  }
  sort(dir: 'asc' | 'desc'): QueryBuilder<Have | 'sort'> {
    this.data.sort = dir;
    return this as unknown as QueryBuilder<Have | 'sort'>;
  }
  fields(...f: readonly string[]): QueryBuilder<Have | 'fields'> {
    this.data.fields = f;
    return this as unknown as QueryBuilder<Have | 'fields'>;
  }
  build(): Result<QueryParams, string> {
    for (const k of ['limit', 'offset'] as const) {
      if (this.data[k] === undefined) return err(`missing required: ${k}`);
    }
    return ok(this.data as QueryParams);
  }
}

// ---------------------------------------------------------------------------
// 3. Repository 模式
// ---------------------------------------------------------------------------

export interface Identified {
  readonly id: string;
}

export interface Repository<T extends Identified> {
  findById(id: string): Promise<T | undefined>;
  list(): Promise<readonly T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

export class InMemoryRepository<T extends Identified> implements Repository<T> {
  private readonly store = new Map<string, T>();
  constructor(seed: readonly T[] = []) {
    for (const e of seed) this.store.set(e.id, e);
  }
  async findById(id: string): Promise<T | undefined> {
    return this.store.get(id);
  }
  async list(): Promise<readonly T[]> {
    return [...this.store.values()];
  }
  async save(entity: T): Promise<T> {
    this.store.set(entity.id, entity);
    return entity;
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

// ---------------------------------------------------------------------------
// 4. 类型化的事件发射器
// ---------------------------------------------------------------------------

// `Emitter<{ login: (u: User) => void; logout: (u: User) => void }>`
//   .on('login', u => ...)  // u 的类型为 User
// 约束：事件映射必须是值类型为函数的 Record。
// 我们接受任何形状为 Record 且值为函数的类型。
type AnyEventMap = Record<string, (...args: never[]) => unknown>;

export class Emitter<E extends AnyEventMap> {
  private readonly listeners: { [K in keyof E]?: Set<E[K]> } = {};
  on<K extends keyof E>(event: K, listener: E[K]): this {
    const set = this.listeners[event] ?? new Set<E[K]>();
    set.add(listener);
    this.listeners[event] = set;
    return this;
  }
  off<K extends keyof E>(event: K, listener: E[K]): this {
    this.listeners[event]?.delete(listener);
    return this;
  }
  emit<K extends keyof E>(event: K, ...args: Parameters<E[K]>): void {
    const set = this.listeners[event];
    if (!set) return;
    for (const l of set) (l as (...a: Parameters<E[K]>) => void)(...args);
  }
}

// ---------------------------------------------------------------------------
// 5. 访问者模式
// ---------------------------------------------------------------------------

export interface ExprVisitor<R> {
  number(n: number): R;
  add(lhs: Expr, rhs: Expr): R;
  mul(lhs: Expr, rhs: Expr): R;
  neg(expr: Expr): R;
}

export type Expr =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'add'; readonly lhs: Expr; readonly rhs: Expr }
  | { readonly kind: 'mul'; readonly lhs: Expr; readonly rhs: Expr }
  | { readonly kind: 'neg'; readonly expr: Expr };

export const expr: {
  num(n: number): Expr;
  add(a: Expr, b: Expr): Expr;
  mul(a: Expr, b: Expr): Expr;
  neg(a: Expr): Expr;
} = {
  num: (n) => ({ kind: 'number', value: n }),
  add: (lhs, rhs) => ({ kind: 'add', lhs, rhs }),
  mul: (lhs, rhs) => ({ kind: 'mul', lhs, rhs }),
  neg: (e) => ({ kind: 'neg', expr: e }),
};

// Visitor：单一对象，按 Expr 的 kind 进行分派。
// 方法直接引用具名导出，以避免 `this` 绑定带来的意外
// （该对象本身也是一个值，而非类）。
export const evaluate: ExprVisitor<number> = {
  number: (n) => n,
  add: (l, r) => evaluateVisitor(l) + evaluateVisitor(r),
  mul: (l, r) => evaluateVisitor(l) * evaluateVisitor(r),
  neg: (e) => -evaluateVisitor(e),
};

function evaluateVisitor(e: Expr): number {
  switch (e.kind) {
    case 'number':
      return evaluate.number(e.value);
    case 'add':
      return evaluate.add(e.lhs, e.rhs);
    case 'mul':
      return evaluate.mul(e.lhs, e.rhs);
    case 'neg':
      return evaluate.neg(e.expr);
    default:
      return assertNever(e);
  }
}

export { evaluateVisitor as visit };

// ---------------------------------------------------------------------------
// 6. 通过生成器实现的 Saga / 异步编排
// ---------------------------------------------------------------------------

// Saga 是一个会产出 step handle 的生成器。运行器会 await 它们，
// 并把结果回喂给生成器。这让异步状态机保持扁平且易于测试。
export interface SagaStep<T> {
  readonly kind: 'fetch';
  readonly url: string;
  __t?: T;
}
export type StepResult<S> = S extends SagaStep<infer T> ? T : never;

export function* saga(): Generator<SagaStep<unknown>, void, unknown> {
  const a = (yield { kind: 'fetch', url: '/a' } as SagaStep<{ id: string }>) as { id: string };
  const b = (yield { kind: 'fetch', url: `/b/${a.id}` } as SagaStep<{ ok: boolean }>) as { ok: boolean };
  void b;
}

export async function runSaga<T>(gen: Generator<SagaStep<unknown>, T, unknown>, fetchStep: (url: string) => Promise<unknown>): Promise<T> {
  let next = gen.next();
  while (!next.done) {
    const step = next.value as SagaStep<unknown>;
    const result = await fetchStep(step.url);
    next = gen.next(result);
  }
  return next.value;
}

// ---------------------------------------------------------------------------
// 7. 命令模式
// ---------------------------------------------------------------------------

export type Command =
  | { readonly kind: 'createUser'; readonly email: string }
  | { readonly kind: 'deleteUser'; readonly id: string }
  | { readonly kind: 'renameUser'; readonly id: string; readonly newName: string };

export type CommandResult<R extends Command> =
  R extends { kind: 'createUser' } ? { readonly id: string } :
  R extends { kind: 'deleteUser' } ? { readonly deleted: true } :
  R extends { kind: 'renameUser' } ? { readonly renamed: true } :
  never;

export async function execute<R extends Command>(cmd: R): Promise<CommandResult<R>> {
  switch (cmd.kind) {
    case 'createUser':
      return { id: 'u_new' } as CommandResult<R>;
    case 'deleteUser':
      return { deleted: true } as CommandResult<R>;
    case 'renameUser':
      return { renamed: true } as CommandResult<R>;
    default:
      return assertNever(cmd);
  }
}

if (import.meta.url === `file:///${process.argv[1]}`) {
  const q = QueryBuilder.start().limit(10).offset(0).build();
  console.info('query =', q);

  const expr1 = expr.add(expr.num(1), expr.mul(expr.num(2), expr.num(3)));
  console.info('expr1 =', (evaluate as unknown as { visit: (e: Expr) => number }).visit(expr1));

  const conn = Connection.idle().connect().open('peer-1');
  console.info('conn =', conn.describe());
}
