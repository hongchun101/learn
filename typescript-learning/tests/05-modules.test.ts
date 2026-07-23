import { describe, it, expect } from 'vitest';
import { Currency, readEnv } from '../src/05-modules/index.js';

describe('Module 5: Modules & Declaration Files', () => {
  it('Currency is both interface and namespace', () => {
    const c = Currency.fromMajor('EUR', 9.99);
    expect(c.code).toBe('EUR');
    expect(c.amount).toBe(999);
  });

  it('process.env is typed via global augmentation', () => {
    // readEnv() 返回 NodeJS.ProcessEnv（即经过全局增强后的类型）。
    // 这里不对具体值做断言，因为它们取决于运行时的进程环境。
    const env = readEnv();
    expect(typeof env).toBe('object');
  });
});
