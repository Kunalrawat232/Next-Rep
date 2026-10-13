import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { unsafePublicEnvProblems } from './src/data/remote/env';
import { manifest } from './pwa.config';

/** Stops the dev server and the build when a secret would be published through a VITE_ variable. */
function guardPublicEnv(): Plugin {
  return {
    name: 'guard-public-env',
    configResolved(config) {
      const problems = unsafePublicEnvProblems(config.env);
      if (problems.length > 0)
        throw new Error(
          `Refusing to run, because a secret could reach the browser:\n- ${problems.join('\n- ')}`,
        );
    },
  };
}

export default defineConfig({
  plugins: [
    guardPublicEnv(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest,
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // The app shell, icons and the Latin font cut, so a cold start offline looks right.
        globPatterns: ['**/*.{js,css,html,svg,png}', '**/geist-latin-wght-normal*.woff2'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts', 'tests/design/**/*.test.ts'],
  },
});
