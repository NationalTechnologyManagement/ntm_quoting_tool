import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    // Don't auto-run integration tests that hit Prisma; only unit tests in src.
  },
  resolve: {
    // ESM .js → .ts redirection (matches the project's TS module style).
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1.ts' }],
  },
});
