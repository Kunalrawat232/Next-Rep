import { THEME_COLOR, THEME_KEY } from './themeColors';

export { THEME_COLOR, THEME_KEY };
export type Theme = 'dark' | 'light';

export const DEFAULT_THEME: Theme = 'dark';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function readTheme(storage: Store): Theme {
  try {
    const value = storage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME; // storage blocked: the default theme
  }
}

export function writeTheme(storage: Store, theme: Theme): void {
  try {
    storage.setItem(THEME_KEY, theme);
  } catch {
    // not kept: it applies for this visit only
  }
}

/** Puts the theme on the page: the attribute the CSS reads, and the colour of the browser's own bars. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}
