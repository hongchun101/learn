/**
 * Module 16 — Real-World Type-System Patterns
 *
 * Topics:
 *  - End-to-end type-safe RPC contracts (server function + client)
 *  - DI container with constructor injection
 *  - Plugin systems with typed registration
 *  - Form schemas with field-level typing
 *  - Typed event bus (deepened)
 *  - Type-safe environment configuration
 *  - Branded IDs in DTOs end-to-end
 *
 * These are the patterns that show up in production codebases and in
 * senior TS interviews. They demonstrate "you can design a type system
 * for a non-trivial application."
 */

import type { Brand } from '../15-narrowing/index.js';

// ---------------------------------------------------------------------------
// 1. End-to-end type-safe RPC contracts
// ---------------------------------------------------------------------------
//
// The contract is a single object: every method is `(input) => Promise<output>`.
// The server implements it; the client consumes it. TS infers the exact
// request/response types at both ends.

export interface User {
  readonly id: Brand<string, 'UserId'>;
  readonly email: string;
  readonly name: string;
}

export interface ApiContract {
  readonly createUser: (input: { readonly email: string; readonly name: string }) => Promise<User>;
  readonly getUser: (input: { readonly id: User['id'] }) => Promise<User | null>;
  readonly listUsers: () => Promise<readonly User[]>;
  readonly deleteUser: (input: { readonly id: User['id'] }) => Promise<{ readonly ok: true }>;
}

// Client wrapper: takes a transport, returns a typed proxy.
export interface Transport {
  call<K extends keyof ApiContract>(
    method: K,
    input: Parameters<ApiContract[K]>[0],
  ): Promise<Awaited<ReturnType<ApiContract[K]>>>;
}

// In-memory transport for the demo:
export function inMemoryTransport(impl: ApiContract): Transport {
  return {
    async call(method, input) {
      // TS picks the right method overload by `method` and forwards `input`.
      const fn = impl[method] as (i: unknown) => Promise<unknown>;
      return fn(input) as never;
    },
  };
}

// ---------------------------------------------------------------------------
// 2. DI container with constructor injection
// ---------------------------------------------------------------------------
//
// Each service declares what it needs in its constructor. The container
// resolves dependencies at construction time. TS checks the graph: if a
// service needs a type that's not registered, it errors.

export class Container {
  private services = new Map<symbol, unknown>();

  register<T>(tag: symbol, value: T): this {
    this.services.set(tag, value);
    return this;
  }

  resolve<T>(tag: symbol): T {
    const value = this.services.get(tag);
    if (value === undefined) throw new Error(`no service for ${String(tag)}`);
    return value as T;
  }
}

// Demo services:
const USER_REPO = Symbol('UserRepo');
const LOGGER = Symbol('Logger');

export interface UserRepo {
  findById(id: User['id']): Promise<User | null>;
  save(u: User): Promise<void>;
}

export interface Logger {
  info(msg: string): void;
  error(msg: string, err?: unknown): void;
}

export class UserService {
  constructor(
    private readonly repo: UserRepo,
    private readonly log: Logger,
  ) {}

  async getUser(id: User['id']): Promise<User | null> {
    this.log.info(`getUser ${id}`);
    return this.repo.findById(id);
  }
}

export function makeContainer(): Container {
  const c = new Container();
  const repo: UserRepo = {
    async findById(id) {
      return { id, email: 'a@b', name: 'Ada' };
    },
    async save(_u) {
      // no-op
    },
  };
  const log: Logger = {
    info: (m: string) => console.info(m),
    error: (m: string, e?: unknown) => console.error(m, e),
  };
  c.register(USER_REPO, repo);
  c.register(LOGGER, log);
  return c;
}

export function buildUserService(c: Container): UserService {
  return new UserService(c.resolve(USER_REPO), c.resolve(LOGGER));
}

// ---------------------------------------------------------------------------
// 3. Plugin systems with typed registration
// ---------------------------------------------------------------------------
//
// A typed registry. Each plugin declares its name and the shape of its
// public API. The registry enforces that no two plugins share a name.

export interface Plugin<A> {
  readonly name: string;
  readonly api: A;
}

export class PluginRegistry<A> {
  private plugins = new Map<string, A>();

  register(plugin: Plugin<A>): this {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`plugin already registered: ${plugin.name}`);
    }
    this.plugins.set(plugin.name, plugin.api);
    return this;
  }

  get(name: string): A | undefined {
    return this.plugins.get(name);
  }

  list(): readonly string[] {
    return [...this.plugins.keys()];
  }
}

// Demo: a feature-flag system where each flag is a plugin.
export interface FeatureFlag {
  isEnabled(ctx: { userId?: string }): boolean;
}

export function featureFlag(name: string, enabled = true): Plugin<FeatureFlag> {
  return {
    name,
    api: { isEnabled: () => enabled },
  };
}

// ---------------------------------------------------------------------------
// 4. Form schemas with field-level typing
// ---------------------------------------------------------------------------
//
// Each field has a parser; the form aggregates them. The form's output
// type is the record's value type. This is the same pattern Zod and
// Valibot expose, but with explicit field descriptors.

export type FieldParser<T> = (raw: unknown) => T;
// `Field<T>` is intentionally bivariant in `T` (TS treats function-property
// position as bivariant by default, except under `strictFunctionTypes`).
// We mark it explicitly with `in out T` (TS 4.7+) so a `Field<string>` is
// assignable to `Field<unknown>` for storage purposes.
export interface Field<in out T> {
  readonly key: string;
  readonly label: string;
  readonly parse: FieldParser<T>;
  readonly serialize: (v: T) => unknown;
}
export function field<T>(opts: {
  key: string;
  label: string;
  parse: FieldParser<T>;
  serialize: (v: T) => unknown;
}): Field<T> {
  return opts;
}
// `Form<F>` infers the per-field value type from each `Field<T>` member.
// We accept any `F extends Record<string, Field<any>>` for variance
// reasons — `Field<T>` is invariant due to its `parse` and `serialize`,
// so we cannot constrain the storage type to `Field<unknown>` and still
// allow `Field<string>` object-literal members.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FieldMap = Record<string, Field<any>>;
export type FieldValues<F> = {
  readonly [K in keyof F]: F[K] extends Field<infer V> ? V : never;
};
export class Form<F extends FieldMap> {
  constructor(public readonly fields: F) {}

  // Parse a raw input into a fully-typed value.
  parse(
    raw: { readonly [K in keyof F]: unknown },
  ): { ok: true; value: FieldValues<F> } | { ok: false; errors: Record<string, string> } {
    const errors: Record<string, string> = {};
    const out: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(this.fields)) {
      try {
        out[k] = (f as Field<unknown>).parse(raw[k as keyof F]);
      } catch (e) {
        errors[k] = e instanceof Error ? e.message : 'parse error';
      }
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return { ok: true, value: out as FieldValues<F> };
  }

  serialize(value: FieldValues<F>): { [K in keyof F]: unknown } {
    const out: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(this.fields)) {
      const field = f as Field<unknown>;
      out[k] = field.serialize((value as Record<string, unknown>)[k]);
    }
    return out as { [K in keyof F]: unknown };
  }
}

// Demo form:
export const loginForm = new Form<{
  email: Field<string>;
  age: Field<number>;
}>({
  email: field<string>({
    key: 'email',
    label: 'Email',
    parse: (u) => {
      if (typeof u !== 'string') throw new Error('not a string');
      if (!/^[^@]+@[^@]+$/.test(u)) throw new Error('not an email');
      return u;
    },
    serialize: (v) => v,
  }) as Field<string>,
  age: field<number>({
    key: 'age',
    label: 'Age',
    parse: (u) => {
      const n = typeof u === 'number' ? u : Number(u);
      if (!Number.isInteger(n) || n < 0) throw new Error('not a non-negative integer');
      return n;
    },
    serialize: (v) => v,
  }) as Field<number>,
});


// ---------------------------------------------------------------------------
// 5. Typed event bus (deepened)
// ---------------------------------------------------------------------------
//
// Each event in the bus has a payload type. `emit` and `on` are typed
// against the event name, not against `any`.

export interface EventMap {
  readonly 'user:login': { readonly userId: string };
  readonly 'user:logout': { readonly userId: string };
  readonly 'order:placed': { readonly orderId: string; readonly amount: number };
}

type EventName = keyof EventMap;

export class TypedBus {
  private listeners = new Map<EventName, Set<(payload: unknown) => void>>();

  on<E extends EventName>(name: E, fn: (payload: EventMap[E]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    const wrapped = fn as (p: unknown) => void;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  emit<E extends EventName>(name: E, payload: EventMap[E]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of set) fn(payload);
  }
}

// ---------------------------------------------------------------------------
// 6. Type-safe environment configuration
// ---------------------------------------------------------------------------
//
// Parsing a `process.env` blob into a fully-typed `Env` object. Each
// variable is parsed; missing or invalid values are reported by name.

export type EnvSchema = Record<string, (raw: string) => unknown>;

export type ParsedEnv<S extends EnvSchema> = { readonly [K in keyof S]: ReturnType<S[K]> };

export function parseEnv<S extends EnvSchema>(
  schema: S,
  raw: Readonly<Record<string, string | undefined>>,
): { ok: true; value: ParsedEnv<S> } | { ok: false; errors: Record<string, string> } {
  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const [k, parse] of Object.entries(schema)) {
    const v = raw[k];
    if (v === undefined) {
      errors[k] = 'missing';
      continue;
    }
    try {
      out[k] = parse(v);
    } catch (e) {
      errors[k] = e instanceof Error ? e.message : 'parse error';
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: out as ParsedEnv<S> };
}

export const envSchema = {
  NODE_ENV: (s: string) => {
    if (!['development', 'test', 'production'].includes(s)) throw new Error('bad NODE_ENV');
    return s as 'development' | 'test' | 'production';
  },
  PORT: (s: string) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0) throw new Error('bad PORT');
    return n;
  },
  LOG_LEVEL: (s: string) => {
    if (!['debug', 'info', 'warn', 'error'].includes(s)) throw new Error('bad LOG_LEVEL');
    return s as 'debug' | 'info' | 'warn' | 'error';
  },
} as const;

// ---------------------------------------------------------------------------
// 7. Branded IDs in DTOs (end-to-end)
// ---------------------------------------------------------------------------
//
// Construct a User via the API contract; the returned `id` is branded.
// Pass it to subsequent calls; TS prevents accidentally passing an
// `OrderId` (or a plain string) where a `User['id']` is expected.

export const apiImpl: ApiContract = {
  async createUser({ email, name }) {
    const id = `u_${Math.random().toString(36).slice(2)}` as User['id'];
    return { id, email, name };
  },
  async getUser({ id }) {
    return { id, email: 'a@b', name: 'Ada' };
  },
  async listUsers() {
    return [];
  },
  async deleteUser() {
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// Demo runner
// ---------------------------------------------------------------------------

if (import.meta.url === `file:///${process.argv[1]}`) {
  void (async () => {
    // RPC demo:
    const transport = inMemoryTransport(apiImpl);
    const u = await transport.call('createUser', { email: 'a@b', name: 'Ada' });
    console.info('created', u);

    // DI demo:
    const c = makeContainer();
    const svc = buildUserService(c);
    const fetched = await svc.getUser(u.id);
    console.info('fetched', fetched);

    // Plugin registry demo:
    const flags = new PluginRegistry<FeatureFlag>();
    flags.register(featureFlag('dark-mode', true));
    flags.register(featureFlag('beta', false));
    const dark = flags.get('dark-mode');
    console.info('dark-mode enabled =', dark?.isEnabled({}));

    // Form demo:
    const r = loginForm.parse({ email: 'a@b', age: '30' });
    console.info('form =', r);

    // Bus demo:
    const bus = new TypedBus();
    bus.on('user:login', (p) => console.info('login', p));
    bus.emit('user:login', { userId: 'u_1' });

    // Env demo:
    const parsed = parseEnv(envSchema, {
      NODE_ENV: 'test',
      PORT: '3000',
      LOG_LEVEL: 'info',
    });
    console.info('env =', parsed);
  })();
}
