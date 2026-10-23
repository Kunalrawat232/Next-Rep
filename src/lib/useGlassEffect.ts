import { useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { startLiquidGlass, type LensPreset } from './liquidGlass';

const KEY = 'next-rep-glass';
const CHANGED = 'next-rep-glass-change';

/** The person's choice, kept on this device like the theme. On unless they turned it off. */
export function readGlassEffect(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true; // storage blocked (some private modes)
  }
}

function subscribe(notify: () => void) {
  window.addEventListener(CHANGED, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGED, notify);
    window.removeEventListener('storage', notify);
  };
}

/** The "Liquid glass effect" setting. */
export function useGlassEffect(): { enabled: boolean; setEnabled: (on: boolean) => void } {
  const enabled = useSyncExternalStore(subscribe, readGlassEffect, () => true);
  const setEnabled = useCallback((on: boolean) => {
    try {
      window.localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Without storage the choice lasts until the page is closed.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return { enabled, setEnabled };
}

/**
 * Keeps a lens on this element while the "Liquid glass effect" setting is on. It starts again when the theme
 * changes (the colour behind the app is different) and when the window crosses the phone width, and it is
 * taken off on the way out.
 */
export function useLiquidGlass(ref: RefObject<HTMLElement | null>, preset: LensPreset): void {
  const { enabled } = useGlassEffect();
  const run = useRef(0);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    let stop: () => void = () => undefined;
    const restart = () => {
      stop();
      stop = () => undefined;
      run.current += 1;
      const mine = run.current;
      void startLiquidGlass(element, preset).then((undo) => {
        // A newer start, or leaving the page, came first: this one is not wanted any more.
        if (mine === run.current) stop = undo;
        else undo();
      });
    };
    restart();
    const theme = new MutationObserver(restart);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const width =
      typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 1023px)') : null;
    width?.addEventListener('change', restart);
    return () => {
      run.current += 1;
      stop();
      theme.disconnect();
      width?.removeEventListener('change', restart);
    };
  }, [enabled, ref, preset]);
}
