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

/** `rgb(28 28 30 / 0.55)` as [r, g, b, alpha]. */
function rgba(value: string): [number, number, number, number] {
  const m = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(value);
  if (!m) throw new Error(`not an rgb() colour: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** `top` (with its alpha) laid over an opaque `under`, as a hex colour. */
function over(top: [number, number, number, number], under: [number, number, number]): string {
  const [r, g, b, a] = top;
  const mixed = [r, g, b].map((c, i) => Math.round(c * a + under[i]! * (1 - a)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function glassTokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--(glass-[\w-]+|ambient-[\w]+):\s*(rgb\([^)]*\));/g)].map((m) => [
      m[1],
      m[2]!,
    ]),
  );
}

describe('text on glass', () => {
  // The brightest the colour behind a glass surface can be: the strongest ambient glow over the page.
  // Glass is laid over that, and text over the glass. Both themes, flat and blurred glass.
  const themes = [
    ['dark', dark, glassTokens(blockAfter(':root {'))],
    [
      'light',
      light,
      {
        ...glassTokens(blockAfter(':root {')),
        ...glassTokens(blockAfter("[data-theme='light'] {")),
      },
    ],
  ] as const;

  describe.each(themes)('%s theme (WCAG AA 4.5:1)', (_name, theme, glass) => {
    const ambient = rgba(glass['ambient-a']!);
    const page = hexToRgb(theme['surface-100']!);
    const backdrop = hexToRgb(over(ambient, page));
    for (const fill of ['glass-fill', 'glass-fill-strong'] as const) {
      const surface = over(rgba(glass[fill]!), backdrop);
      it.each(['ink', 'ink-muted', 'accent', 'success', 'warning', 'danger'] as const)(
        `%s on ${fill}`,
        (text) => {
          expect(contrast(theme[text]!, surface)).toBeGreaterThanOrEqual(4.5);
        },
      );
    }

    it('keeps the glass fill translucent enough to be glass, and opaque enough to read on', () => {
      const alpha = rgba(glass['glass-fill']!)[3];
      expect(alpha).toBeGreaterThanOrEqual(0.4);
      expect(alpha).toBeLessThanOrEqual(0.9);
    });
  });

  it('keeps the browser-bar colour the solid page colour, not the glass', () => {
    expect(THEME_COLOR.dark).toBe(dark['surface-100']);
  });
});

describe('lensed controls', () => {
  it('stay clickable: liquid-gl turns pointer events off on the element it lenses, so the stylesheet turns them back on', () => {
    expect(css).toMatch(/\[data-liquid\]\s*\{\s*pointer-events:\s*auto\s*!important;?\s*\}/);
  });
});
