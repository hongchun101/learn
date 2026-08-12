import { describe, it, expect } from 'vitest';
import type {
  FeatureFlag} from '../src/16-real-world/index.js';
import {
  apiImpl,
  buildUserService,
  Container,
  envSchema,
  featureFlag,
  inMemoryTransport,
  loginForm,
  makeContainer,
  parseEnv,
  PluginRegistry,
  TypedBus,
  type User,
} from '../src/16-real-world/index.js';

describe('Module 16: Real-World Type-System Patterns', () => {
  it('RPC contract infers input/output at call sites', async () => {
    const t = inMemoryTransport(apiImpl);
    const u: User = await t.call('createUser', { email: 'a@b', name: 'Ada' });
    expect(u.email).toBe('a@b');
  });

  it('DI container resolves registered services', async () => {
    const c = makeContainer();
    const svc = buildUserService(c);
    const u = await svc.getUser('u_x' as User['id']);
    expect(u?.name).toBe('Ada');
  });

  it('Container.resolve throws on missing service', () => {
    const c = new Container();
    expect(() => c.resolve(Symbol('nope'))).toThrow();
  });

  it('PluginRegistry prevents duplicate names', () => {
    const r = new PluginRegistry<FeatureFlag>();
    r.register(featureFlag('a', true));
    expect(() => r.register(featureFlag('a', false))).toThrow();
    expect(r.list()).toEqual(['a']);
    expect(r.get('a')?.isEnabled({})).toBe(true);
  });

  it('Form.parse narrows each field by its parser', () => {
    const parse = loginForm.parse.bind(loginForm);
    const r = parse({ email: 'a@b', age: '30' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.email).toBe('a@b');
    expect(r.value.age).toBe(30);
  });

  it('Form.parse reports per-field errors', () => {
    const parse = loginForm.parse.bind(loginForm);
    const r = parse({ email: 'not-an-email', age: -1 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected error');
    expect(Object.keys(r.errors).sort()).toEqual(['age', 'email']);
  });

  it('Form.serialize round-trips', () => {
    const parse = loginForm.parse.bind(loginForm);
    const r = parse({ email: 'a@b', age: '30' });
    if (!r.ok) throw new Error('expected ok');
    const back = loginForm.serialize(r.value);
    expect(back).toEqual({ email: 'a@b', age: 30 });
  });

  it('TypedBus delivers events with the right payload type', () => {
    const bus = new TypedBus();
    let loginUserId: string | null = null;
    const off = bus.on('user:login', (p) => {
      loginUserId = p.userId;
    });
    bus.emit('user:login', { userId: 'u_1' });
    expect(loginUserId).toBe('u_1');
    off();
    bus.emit('user:login', { userId: 'u_2' });
    expect(loginUserId).toBe('u_1');
  });

  it('parseEnv returns a typed value', () => {
    const r = parseEnv(envSchema, {
      NODE_ENV: 'test',
      PORT: '3000',
      LOG_LEVEL: 'info',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.NODE_ENV).toBe('test');
    expect(r.value.PORT).toBe(3000);
  });

  it('parseEnv reports missing and invalid entries', () => {
    const r = parseEnv(envSchema, { NODE_ENV: 'production' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected error');
    expect(r.errors['PORT']).toBe('missing');
    expect(r.errors['LOG_LEVEL']).toBeDefined();
  });
});
