// vitest.config.ts (root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/desktop/vitest.config.ts',
      'packages/core/vitest.config.ts',
      'packages/utils/vitest.config.ts',
    ],
  },
});
