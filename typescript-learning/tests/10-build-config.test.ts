import { describe, it, expect } from 'vitest';
import { readProjectMeta } from '../src/10-build-config/index.js';

describe('Module 10: Build & Project Config', () => {
  it('readProjectMeta returns the live tsconfig/package.json', () => {
    const meta = readProjectMeta();
    expect(meta.moduleType).toBe('module');
    expect(meta.strict).toBe(true);
    expect(meta.target).toMatch(/^ES/);
  });
});
