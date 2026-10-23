// The theme is applied twice: by the small script in index.html before the first paint, and by the
// app when the user changes it. Both have to agree with each other and with the CSS tokens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../../index.html?raw';
import { THEME_COLOR, THEME_KEY } from './themeColors';

const inline = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];

function runInlineScript() {
  if (!inline) throw new Error('index.html has no inline script');
  new Function(inline)();
}

function meta() {
  const tag = document.createElement('meta');
  tag.name = 'theme-color';
  tag.content = '#000000';
  document.head.append(tag);
  return tag;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  localStorage.clear();
});

describe('the script that runs before the first paint', () => {
  it('exists and runs before the app (inside the head)', () => {
    expect(inline).toBeDefined();
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'));
  });

  it('applies a saved light theme, and the colour of the browser bars', () => {
    const tag = meta();
    localStorage.setItem(THEME_KEY, 'light');
    runInlineScript();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(tag.content).toBe(THEME_COLOR.light);
  });

  it.each([['dark'], [''], ['blue'], ['<img src=x>'], [null]])(
    'leaves dark alone for %j',
    (value) => {
      const tag = meta();
      if (value !== null) localStorage.setItem(THEME_KEY, value);
      runInlineScript();
      expect(document.documentElement.dataset.theme).toBeUndefined();
      expect(tag.content).toBe('#000000');
    },
  );

  it('does not throw when storage is blocked', () => {
    meta();
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(() => runInlineScript()).not.toThrow();
    } finally {
      blocked.mockRestore();
    }
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('does not throw when the page has no theme-color tag', () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(() => runInlineScript()).not.toThrow();
  });

  it('reads the same storage key the app writes', () => {
    expect(inline).toContain(`'${THEME_KEY}'`);
  });
});

describe('the colours of the browser bars', () => {
  it('start as the dark one in index.html, and the script uses the light one', () => {
    expect(html).toContain(`<meta name="theme-color" content="${THEME_COLOR.dark}"`);
    expect(inline).toContain(THEME_COLOR.light);
  });
});
