import { describe, it, expect, expectTypeOf } from 'vitest';
import type { AppUser} from '../src/17-declarations/index.js';
import { buildId, greet } from '../src/17-declarations/index.js';
import type { User } from '../src/16-real-world/index.js';

describe('Module 17: Declaration Files & JSDoc', () => {
  it('greet is exported with the documented signature', () => {
    expect(greet('Ada')).toBe('Hello, Ada');
    expectTypeOf(greet).parameter(0).toEqualTypeOf<string>();
  });

  it('declare-global __BUILD_ID__ is available', () => {
    expect(typeof buildId).toBe('string');
  });

  it('Type-only import round-trips', () => {
    // `AppUser` is just an alias for `User` from module 16.
    expectTypeOf<AppUser>().toEqualTypeOf<User>();
  });

  it('greet is callable on a string literal', () => {
    // `greet` accepts any string; the literal widens to `string` in the call.
    expect(greet('Linus')).toBe('Hello, Linus');
  });
});
