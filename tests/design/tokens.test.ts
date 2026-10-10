// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_COLOR } from '../../src/features/settings/themeColors';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../../src/index.css');
const handoff = JSON.parse(read('../../docs/design/handoff/2026-10-08/ds/nextrep/tokens.json')) as {
  color: { tokens: { name: string; value: { light: string; dark: string } }[] };
};

function colours(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [
      m[1],
      m[2]!.toLowerCase(),
    ]),
  );
}

function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`missing ${marker} in index.css`);
  return css.slice(start, css.indexOf('\n}', start));
}

const dark = colours(blockAfter('@theme {'));
const light = { ...dark, ...colours(blockAfter("[data-theme='light'] {")) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens', () => {
  it('match the handed-off tokens.json in both themes', () => {
    for (const token of handoff.color.tokens) {
      expect(dark[token.name], `${token.name} dark`).toBe(token.value.dark.toLowerCase());
      expect(light[token.name], `${token.name} light`).toBe(token.value.light.toLowerCase());
    }
  });

  it('keep none of the old placeholder names', () => {
    expect(css).not.toMatch(/--color-surface:|--color-surface-raised/);
  });

  describe.each([
    ['dark', dark],
    ['light', light],
  ])('%s theme text contrast (WCAG AA 4.5:1)', (_name, theme) => {
    const text = ['ink', 'ink-muted', 'accent', 'success', 'warning', 'danger'] as const;
    const grounds = ['surface-100', 'surface-200'] as const;
    const pairs = text.flatMap((fg) => grounds.map((bg) => [fg, bg] as const));

    it.each(pairs)('%s on %s', (fg, bg) => {
      expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(4.5);
    });

    it('on-accent on accent', () => {
      expect(contrast(theme['on-accent']!, theme['accent']!)).toBeGreaterThanOrEqual(4.5);
    });

    it('ink on surface-300 (inputs)', () => {
      expect(contrast(theme['ink']!, theme['surface-300']!)).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('the colour of the browser bars', () => {
  it('is the page background of each theme, as index.html and the Settings switch use it', () => {
    expect(colours(blockAfter('@theme'))['surface-100']).toBe(THEME_COLOR.dark);
    expect(colours(blockAfter("[data-theme='light']"))['surface-100']).toBe(THEME_COLOR.light);
  });
});
