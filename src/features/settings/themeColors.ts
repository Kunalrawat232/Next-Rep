// Kept apart from theme.ts, which needs the browser, so the design tests (which run in node) can read it.

/** One key for the device, not per user: it is how the screen looks, and signing out does not change it. */
export const THEME_KEY = 'next-rep-theme';

/** Matches `--color-surface-100` in each theme (tests/design/tokens.test.ts keeps them equal), so the browser's own bars follow the app. */
export const THEME_COLOR = { dark: '#000000', light: '#fbfbfd' } as const;
