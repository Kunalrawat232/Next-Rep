import type { ManifestOptions } from 'vite-plugin-pwa';

export const THEME_COLOR = '#000000';

export const manifest: Partial<ManifestOptions> = {
  name: 'Next Rep',
  short_name: 'Next Rep',
  description: 'Voice-first gym workout logger',
  theme_color: THEME_COLOR,
  background_color: THEME_COLOR,
  display: 'standalone',
  start_url: '/',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: '/icons/icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};
