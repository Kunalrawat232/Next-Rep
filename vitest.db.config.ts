import { defineConfig } from 'vitest/config';

// Database schema and RLS checks run against PGlite (Postgres in WASM), separate from `npm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
