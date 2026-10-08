import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Tests against the hosted Supabase project. They read credentials from .env.local and skip
// themselves when it is missing, so they are run by the developer, not in CI.
export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ['VITE_SUPABASE', 'E2E_']),
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
}));
