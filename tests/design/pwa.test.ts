// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifest, THEME_COLOR } from '../../pwa.config';

const root = new URL('../../', import.meta.url);

function pngSize(path: string): string {
  const header = readFileSync(new URL(path, root));
  return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
}

describe('PWA manifest', () => {
  it('has the icons an installable app needs: 192, 512 and a maskable 512', () => {
    const icons = manifest.icons ?? [];
    expect(icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  });

  it('points at icon files that exist and really have the declared size', () => {
    for (const icon of manifest.icons ?? []) {
      const path = `public${icon.src}`;
      expect(existsSync(new URL(path, root)), path).toBe(true);
      expect(pngSize(path), path).toBe(icon.sizes);
    }
  });

  it('uses the dark surface as theme and background colour, like index.html', () => {
    expect(manifest.theme_color).toBe(THEME_COLOR);
    expect(manifest.background_color).toBe(THEME_COLOR);
    expect(readFileSync(new URL('index.html', root), 'utf8')).toContain(`content="${THEME_COLOR}"`);
  });

  it('links the favicon and the Apple touch icon from index.html', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8');
    for (const href of ['/favicon.svg', '/icons/apple-touch-icon.png'])
      expect(html).toContain(`href="${href}"`);
    expect(existsSync(new URL('public/favicon.svg', root))).toBe(true);
    expect(pngSize('public/icons/apple-touch-icon.png')).toBe('180x180');
  });
});

describe('offline font', () => {
  it('has a Latin Geist file for the service worker precache glob to match', () => {
    const files = readdirSync(new URL('node_modules/@fontsource-variable/geist/files/', root));
    expect(files.some((f) => /^geist-latin-wght-normal.*\.woff2$/.test(f))).toBe(true);
  });
});

describe('exercise demonstrations and the offline cache', () => {
  const config = readFileSync(new URL('vite.config.ts', root), 'utf8');

  it('never precaches or runtime-caches pictures, so the hotlinked media is not stored by the app', () => {
    const globs = /globPatterns:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(globs).not.toMatch(/gif|jpe?g|webp|avif/);
    expect(config).not.toContain('runtimeCaching');
  });

  it('keeps no copy of the dataset media in the repository', () => {
    for (const dir of ['videos', 'images', 'public/videos', 'public/images'])
      expect(existsSync(new URL(dir, root)), dir).toBe(false);
    const pictures = (path: string) =>
      readdirSync(new URL(path, root), { recursive: true })
        .map(String)
        .filter((file) => /\.(gif|jpe?g)$/i.test(file));
    expect(pictures('public')).toEqual([]);
    expect(pictures('src')).toEqual([]);
  });
});
