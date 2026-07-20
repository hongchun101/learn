import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'modules/**/tests/**/*.test.ts',
    ],
    exclude: [
      'modules/**/node_modules/**',
      'modules/**/target/**',
      'modules/**/target',
      'modules/*-*/build/**',
      'modules/*-*/vendor/**',
    ],
    testTimeout: 60_000,
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@crypto': resolve(here, 'src/crypto'),
      '@tests':  resolve(here, 'tests'),
    },
  },
});
