import { useCallback, useState } from 'react';
import { applyTheme, readTheme, writeTheme, type Theme } from './theme';

const browserStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined };
  }
};

/** The theme on this device, and a way to change it. The change is applied and kept at once. */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => readTheme(browserStorage()));
  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    writeTheme(browserStorage(), next);
    setThemeState(next);
  }, []);
  return { theme, setTheme };
}
