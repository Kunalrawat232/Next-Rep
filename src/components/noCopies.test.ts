import { describe, expect, it } from 'vitest';

// Reads the screens as text to make sure nobody copies the look of the shared components back in.
const screens = import.meta.glob(
  ['../**/*.tsx', '!../**/*.test.tsx', '!../components/**', '!../test/**', '!../tmp-snapshots/**'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

describe('the screens use the shared components', () => {
  it('were read (a guard over nothing would pass without checking anything)', () => {
    expect(Object.keys(screens).length).toBeGreaterThan(30);
    expect(screens['../features/history/HistoryPage.tsx']).toContain('EmptyState');
    expect(screens['../features/settings/SettingsPage.tsx']).toContain('Section');
  });

  it.each([
    ['the card box', 'rounded-md border border-line bg-surface-200'],
    ['the red card box', 'rounded-md border border-danger'],
    ['a warning, success or accent card box', 'rounded-md border border-warning bg'],
    ['a success card box', 'rounded-md border border-success bg'],
    ['an accent card box', 'rounded-md border border-accent bg'],
    ['the page title', '<h1 className="text-title font-semibold">Loading'],
  ])('does not copy %s (use Card, ErrorMessage, EmptyState, Section)', (_name, text) => {
    const copies = Object.entries(screens)
      .filter(([, source]) => source.includes(text))
      .map(([path]) => path);
    expect(copies).toEqual([]);
  });

  it('does not write a loading status by hand', () => {
    const copies = Object.entries(screens)
      .filter(([, source]) => /<p role="status" className="text-ink-muted">/.test(source))
      .map(([path]) => path);
    expect(copies).toEqual([]);
  });

  it('does not build a back link and page title by hand', () => {
    const copies = Object.entries(screens)
      .filter(([, source]) => source.includes('<BackLink'))
      .map(([path]) => path);
    expect(copies).toEqual([]);
  });
});
