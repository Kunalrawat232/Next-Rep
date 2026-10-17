import type { LiquidGlassLens } from 'liquid-gl';

/**
 * The liquid glass effect (liquid-gl, MIT): a WebGL lens that refracts the colour behind a small, rounded,
 * floating element. This is the ONE place that configures it. It is put on the floating Workout button, the
 * floating tab bar and the rest pill, on phones (see ADR-016); everything else uses the plain CSS glass in
 * index.css, which is cheap. Set `enabled` to false to remove the effect entirely.
 */
export const LIQUID_GLASS = {
  enabled: true,
  /** What a lens refracts: the fixed colour layer behind the app. It never changes with the page, so the
   *  one snapshot never goes stale and never grows with a long page. */
  snapshot: '#ambient',
  /** The floating elements are only floating on phones and tablets; from 1024 px up the navigation is a sidebar. */
  phoneQuery: '(max-width: 1023px)',
  presets: {
    /** A circle or a pill: a visible rim and a bright edge. */
    round: {
      resolution: 1,
      refraction: 0.06,
      bevelDepth: 0.3,
      bevelWidth: 0.4,
      frost: 0,
      shadow: true,
      specular: true,
      reveal: 'none',
    },
    /** A long rounded bar: a gentler bend with a touch of frost. */
    dock: {
      resolution: 1,
      refraction: 0.05,
      bevelDepth: 0.22,
      bevelWidth: 0.3,
      frost: 1,
      shadow: true,
      specular: true,
      reveal: 'none',
    },
  },
} as const;

export type LensPreset = keyof typeof LIQUID_GLASS.presets;

/**
 * Whether the effect can and should run on this device: WebGL exists, and the person has not asked for less
 * transparency or more contrast. Where it cannot, the CSS glass stays as it is.
 */
export function canUseLiquidGlass(win: Window = window): boolean {
  const asks = (query: string) =>
    typeof win.matchMedia === 'function' && win.matchMedia(query).matches;
  if (asks('(prefers-reduced-transparency: reduce)') || asks('(prefers-contrast: more)'))
    return false;
  if (!('WebGLRenderingContext' in win)) return false;
  try {
    const canvas = win.document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const nothing = () => undefined;
let lensCount = 0;

/**
 * Puts a lens on one element and returns the function that takes it off again. The element must be fixed or
 * sticky. Never throws: if the effect cannot start, nothing changes and the returned function does nothing.
 * The library is loaded on demand, so devices that cannot use it never download it.
 */
export async function startLiquidGlass(
  element: HTMLElement,
  preset: LensPreset,
  win: Window = window,
): Promise<() => void> {
  if (!LIQUID_GLASS.enabled || !canUseLiquidGlass(win)) return nothing;
  if (!win.matchMedia(LIQUID_GLASS.phoneQuery).matches) return nothing;
  if (!element.isConnected) return nothing;

  // The library takes a selector, so the element gets a name of its own for as long as it has a lens.
  lensCount += 1;
  const mark = `lens-${lensCount}`;
  element.setAttribute('data-liquid', mark);
  const unmark = () => element.removeAttribute('data-liquid');

  let lenses: LiquidGlassLens[];
  try {
    const { default: liquidGL } = await import('liquid-gl');
    // The page may have changed while the library loaded.
    if (!element.isConnected) {
      unmark();
      return nothing;
    }
    const made = liquidGL({
      ...LIQUID_GLASS.presets[preset],
      target: `[data-liquid="${mark}"]`,
      snapshot: LIQUID_GLASS.snapshot,
    });
    lenses = made === undefined ? [] : Array.isArray(made) ? made : [made];
  } catch {
    unmark();
    return nothing;
  }
  return () => {
    for (const lens of lenses) {
      try {
        lens.destroy();
      } catch {
        // A lens that cannot be taken off must not break the page it is on.
      }
    }
    unmark();
  };
}
