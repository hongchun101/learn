import { describe, it, expect } from 'vitest';
import { Currency, readEnv } from '../src/05-modules/index.js';

describe('Module 5: Modules & Declaration Files', () => {
  it('Currency is both interface and namespace', () => {
    const c = Currency.fromMajor('EUR', 9.99);
    expect(c.code).toBe('EUR');
    expect(c.amount).toBe(999);
  });

  it('process.env is typed via global augmentation', () => {
    // readEnv() returns NodeJS.ProcessEnv (the augmented type).
    // We do not assert specific values because they're process-dependent.
    const env = readEnv();
    expect(typeof env).toBe('object');
  });
});
