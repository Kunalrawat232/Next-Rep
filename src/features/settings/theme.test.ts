import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, readTheme, THEME_COLOR, THEME_KEY, writeTheme } from './theme';

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
};

const blocked = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
});

describe('readTheme', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    [null, 'dark'],
    ['', 'dark'],
    ['LIGHT', 'dark'],
    ['blue', 'dark'],
    ['<script>', 'dark'],
  ])('reads %j as %s', (saved, expected) => {
    const storage = memory(saved === null ? {} : { [THEME_KEY]: saved });
    expect(readTheme(storage)).toBe(expected);
  });

  it('falls back to dark when storage is blocked', () => {
    expect(readTheme(blocked)).toBe('dark');
  });
});

describe('writeTheme', () => {
  it('keeps the choice', () => {
    const storage = memory();
    writeTheme(storage, 'light');
    expect(storage.data.get(THEME_KEY)).toBe('light');
  });

  it('does not throw when storage is blocked', () => {
    expect(() => writeTheme(blocked, 'light')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('sets the attribute the CSS reads and the colour of the browser bars', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = THEME_COLOR.dark;
    document.head.append(meta);
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(meta.content).toBe(THEME_COLOR.light);
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(meta.content).toBe(THEME_COLOR.dark);
  });

  it('works when the page has no theme-color tag', () => {
    expect(() => applyTheme('light')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
