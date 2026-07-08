import { describe, it, expect } from 'vitest';
import {
  array,
  boolean,
  createUser,
  Email,
  Iso8601,
  literal,
  number,
  object,
  optional,
  parseCreateUserDto,
  parseEnv,
  PositiveInt,
  string,
  union,
  userIdParser,
  emailParser,
  UserId,
  NonEmptyString,
} from '../src/09-validation/index.js';

describe('Module 9: DTO & Runtime Validation', () => {
  it('branded smart constructors reject bad input', () => {
    expect(UserId('u_1').ok).toBe(true);
    expect(UserId('xxx').ok).toBe(false);
    expect(Email('a@b.co').ok).toBe(true);
    expect(Email('no-at').ok).toBe(false);
    expect(PositiveInt(5).ok).toBe(true);
    expect(PositiveInt(-1).ok).toBe(false);
    expect(PositiveInt(1.5).ok).toBe(false);
    expect(Iso8601('2024-01-01T00:00:00Z').ok).toBe(true);
    expect(Iso8601('not-a-date').ok).toBe(false);
    expect(NonEmptyString('x').ok).toBe(true);
    expect(NonEmptyString('').ok).toBe(false);
  });

  it('schema primitives', () => {
    expect(string('x').ok).toBe(true);
    expect(string(1).ok).toBe(false);
    expect(number(1).ok).toBe(true);
    expect(number('1').ok).toBe(false);
    expect(boolean(true).ok).toBe(true);
    expect(boolean('true').ok).toBe(false);
    expect(literal('on')('on').ok).toBe(true);
    expect(literal('on')('off').ok).toBe(false);
  });

  it('array parser collects errors', () => {
    const r = array(number)([1, 2, 'x', 4]);
    expect(r.ok).toBe(false);
  });

  it('object parser validates shape', () => {
    const r = object({ a: number, b: string })({ a: 1, b: 'x' });
    expect(r.ok).toBe(true);
    const r2 = object({ a: number, b: string })({ a: 1, b: 2 });
    expect(r2.ok).toBe(false);
  });

  it('union picks the first matching member', () => {
    const p = union(literal('a'), literal('b'), literal('c'));
    expect(p('b').ok).toBe(true);
    expect(p('z').ok).toBe(false);
  });

  it('parseCreateUserDto happy path', () => {
    const raw = {
      id: 'u_1',
      email: 'a@b.co',
      name: 'Ada',
      age: 30,
      createdAt: '2024-01-01T00:00:00Z',
    };
    const r = parseCreateUserDto(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe('u_1');
      const out = createUser(r.value);
      expect(out.welcome).toContain('Ada');
    }
  });

  it('parseCreateUserDto rejects bad email', () => {
    const r = parseCreateUserDto({
      id: 'u_1',
      email: 'no-at',
      name: 'Ada',
      age: 30,
      createdAt: '2024-01-01T00:00:00Z',
    });
    expect(r.ok).toBe(false);
  });

  it('branded parsers validate underlying string', () => {
    expect(userIdParser('u_1').ok).toBe(true);
    expect(emailParser('a@b.co').ok).toBe(true);
    expect(emailParser('nope').ok).toBe(false);
  });

  it('parseEnv validates shape', () => {
    const r = parseEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      LOG_LEVEL: 'info',
    });
    expect(r.ok).toBe(true);
  });

  it('optional parser handles undefined', () => {
    const p = optional(string);
    expect(p(undefined).ok).toBe(true);
    expect(p('x').ok).toBe(true);
  });
});
