/**
 * 模块 9：DTO、运行时校验、品牌类型
 *
 * 内容包括：
 *  - "在边界处校验，在类型层信任" 模式
 *  - 不依赖任何外部库，构建一个轻量的 schema 校验器
 *  - 品牌化的基本类型（字符串 ID、经过校验的数字）
 *  - 智能构造函数
 *  - 适用于查询字符串 / 请求体的表单式 DTO 解析
 *  - 类似 OpenAPI 的契约形态
 *
 * 注意：本模块实现了一个迷你校验器，用于演示该模式。
 * 在实际项目中，更推荐使用 Zod / Valibot / Typia。这里不引入额外依赖，
 * 是为了保持示例自包含。
 */

import { ok, err, unwrap } from '../01-basics/index.js';
import type { Result } from '../01-basics/index.js';
import type { Brand as _Brand } from '../05-modules/types.js';

// ---------------------------------------------------------------------------
// 1. 品牌化的基本类型
// ---------------------------------------------------------------------------

// 可复用的 Brand：运行时是 T，编译时被品牌化。
type Brand<T, K extends string> = T & { readonly __brand: K };

export type UserId = Brand<string, 'UserId'>;
export type Email = Brand<string, 'Email'>;
export type PositiveInt = Brand<number, 'PositiveInt'>;
export type Iso8601 = Brand<string, 'Iso8601'>;
export type NonEmptyString = Brand<string, 'NonEmptyString'>;

// 智能构造函数 —— 只有这些构造函数能够产出对应的品牌类型。
export const UserId = (s: string): Result<UserId, string> =>
  /^u_[A-Za-z0-9]+$/.test(s) ? ok(s as UserId) : err(`not a valid UserId: ${s}`);

export const Email = (s: string): Result<Email, string> =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? ok(s as Email) : err(`not a valid email: ${s}`);

export const PositiveInt = (n: number): Result<PositiveInt, string> =>
  Number.isInteger(n) && n > 0 ? ok(n as PositiveInt) : err(`not a positive int: ${n}`);

export const Iso8601 = (s: string): Result<Iso8601, string> =>
  !Number.isNaN(Date.parse(s)) ? ok(s as Iso8601) : err(`not a valid ISO date: ${s}`);

export const NonEmptyString = (s: string): Result<NonEmptyString, string> =>
  s.length > 0 ? ok(s as NonEmptyString) : err('string is empty');

// ---------------------------------------------------------------------------
// 2. 一个迷你的 schema 组合子库
// ---------------------------------------------------------------------------

// `Parser<A>` 接收 `unknown`，返回 `Result<A, string>`。
export type Parser<A> = (input: unknown) => Result<A, string>;

export const string: Parser<string> = (u) =>
  typeof u === 'string' ? ok(u) : err(`expected string, got ${typeof u}`);

export const number: Parser<number> = (u) =>
  typeof u === 'number' && !Number.isNaN(u) ? ok(u) : err(`expected number, got ${typeof u}`);

export const boolean: Parser<boolean> = (u) => (typeof u === 'boolean' ? ok(u) : err(`expected boolean`));

export const literal = <L extends string | number | boolean>(value: L): Parser<L> => (u) =>
  u === value ? ok(value) : err(`expected ${JSON.stringify(value)}, got ${JSON.stringify(u)}`);

export const nullable = <A>(p: Parser<A>): Parser<A | null> => (u) =>
  u === null ? ok(null) : p(u);

export const optional = <A>(p: Parser<A>): Parser<A | undefined> => (u) =>
  u === undefined ? ok(undefined) : p(u);

export const array = <A>(p: Parser<A>): Parser<readonly A[]> => (u) => {
  if (!Array.isArray(u)) return err(`expected array, got ${typeof u}`);
  const out: A[] = [];
  for (let i = 0; i < u.length; i++) {
    const r = p(u[i]);
    if (!r.ok) return err(`[${i}]: ${r.error}`);
    out.push(r.value);
  }
  return ok(out);
};

// 对象解析器：{ [K in keyof S]: Parser<S[K]> }
export type ObjectSchema<S> = {
  [K in keyof S]: Parser<S[K]>;
};

export const object = <S extends Record<string, unknown>>(schema: ObjectSchema<S>): Parser<S> => (u) => {
  if (typeof u !== 'object' || u === null) return err('expected object');
  const r = u as Record<string, unknown>;
  const out = {} as S;
  for (const k of Object.keys(schema) as (keyof S)[]) {
    const v = r[k as string];
    const parsed = schema[k](v);
    if (!parsed.ok) return err(`${String(k)}: ${parsed.error}`);
    out[k] = parsed.value;
  }
  return ok(out);
};

export const union = <A extends readonly Parser<unknown>[]>(...parsers: A) => (
  u: unknown,
): Result<A[number] extends Parser<infer T> ? T : never, string> => {
  for (const p of parsers) {
    const r = p(u);
    if (r.ok) return r as Result<A[number] extends Parser<infer T> ? T : never, string>;
  }
  return err('no union member matched');
};

// ---------------------------------------------------------------------------
// 3. 基于 schema 原语构建的品牌化解析器
// ---------------------------------------------------------------------------

export const userIdParser: Parser<UserId> = (u) => {
  const s = string(u);
  return s.ok ? UserId(s.value) : err(s.error);
};

export const emailParser: Parser<Email> = (u) => {
  const s = string(u);
  return s.ok ? Email(s.value) : err(s.error);
};

// ---------------------------------------------------------------------------
// 4. 带有品牌字段的 DTO
// ---------------------------------------------------------------------------

export interface CreateUserDto {
  readonly id: UserId;
  readonly email: Email;
  readonly name: NonEmptyString;
  readonly age: PositiveInt;
  readonly createdAt: Iso8601;
  readonly tags?: readonly string[];
  readonly status?: 'active' | 'invited' | 'disabled';
}

const createUserDtoSchema: ObjectSchema<CreateUserDto> = {
  id: userIdParser,
  email: emailParser,
  name: (u) => {
    const s = string(u);
    return s.ok ? NonEmptyString(s.value) : err(s.error);
  },
  age: (u) => {
    const n = number(u);
    return n.ok ? PositiveInt(n.value) : err(n.error);
  },
  createdAt: (u) => {
    const s = string(u);
    return s.ok ? Iso8601(s.value) : err(s.error);
  },
  tags: optional(array(string)) as Parser<readonly string[] | undefined>,
  status: optional(union(literal('active'), literal('invited'), literal('disabled'))) as Parser<
    'active' | 'invited' | 'disabled' | undefined
  >,
};

export const parseCreateUserDto = (raw: unknown): Result<CreateUserDto, string> =>
  object(createUserDtoSchema)(raw) as Result<CreateUserDto, string>;

// ---------------------------------------------------------------------------
// 5. 受信端的用法：接收已解析 DTO 的函数
// ---------------------------------------------------------------------------

export function createUser(dto: CreateUserDto): { id: UserId; welcome: string } {
  return {
    id: dto.id,
    welcome: `Welcome ${dto.name} (${dto.email})`,
  };
}

// ---------------------------------------------------------------------------
// 6. 环境变量解析 —— 在进程启动时使用
// ---------------------------------------------------------------------------

interface EnvShape {
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly DATABASE_URL: string;
  readonly LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

const envSchema: ObjectSchema<EnvShape> = {
  NODE_ENV: union(literal('development'), literal('test'), literal('production')) as Parser<EnvShape['NODE_ENV']>,
  DATABASE_URL: string,
  LOG_LEVEL: union(literal('debug'), literal('info'), literal('warn'), literal('error')) as Parser<EnvShape['LOG_LEVEL']>,
};

export const parseEnv = (raw: Readonly<Record<string, string | undefined>>): Result<EnvShape, string> =>
  object(envSchema)(raw) as Result<EnvShape, string>;

if (import.meta.url === `file:///${process.argv[1]}`) {
  const raw = { id: 'u_1', email: 'a@b.co', name: 'Ada', age: 30, createdAt: new Date().toISOString() };
  const dto = unwrap(parseCreateUserDto(raw));
  console.info('createUser =', createUser(dto));
}

// Brand 已经作为 `_Brand` 从 types.ts 中导入并在内部使用。
// 重新导出规范的别名，以保持对外 API 的一致性。
export type { _Brand as Brand };
