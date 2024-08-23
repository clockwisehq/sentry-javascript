import baseConfig from '@sentry-internal/vitest-config';
import type { UserConfig } from 'vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...(baseConfig as UserConfig & { test: any }).test,
    coverage: {},
    globals: true,
    setupFiles: ['./setup-test.ts'],
    reporters: ['default'],
    environment: 'jsdom',
  },
});
