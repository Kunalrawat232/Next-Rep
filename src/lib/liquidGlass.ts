import type { LiquidGlassLens } from 'liquid-gl';

/**
 * The liquid glass effect (liquid-gl, MIT): a WebGL lens that refracts the colour behind a fixed element. This
 * is the ONE place that configures it. It is used on a single surface, the floating Workout button on phones
 * (`.liquidGL` in AppShell); everything else uses the plain CSS glass in index.css, which is cheap and looks
 * the same over our dark background (see ADR-016). Set `enabled` to false to remove the effect entirely.
 */
export const LIQUID_GLASS = {
  enabled: true,
  /** The elements that get a lens. They must be position: fixed (or sticky). */
  target: '.liquidGL',
  /** What the lens refracts: the fixed colour layer behind the app. It never changes with the page, so the
   *  one snapshot never goes stale and never grows with a long page. */
  snapshot: '#ambient',
  /** The fixed button only exists on phones and tablets; from 1024 px up the navigation is a sidebar. */
  phoneQuery: '(max-width: 1023px)',
  options: {
    resolution: 1,
    refraction: 0.06,
    bevelDepth: 0.3,
    bevelWidth: 0.4,
    frost: 0,
    shadow: true,
    specular: true,
    reveal: 'none',
    /** Must equal the z-index of the target (z-10 in AppShell). */
    zIndex: 10,
  },
} as const;

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

/**
 * Puts a lens on every target and returns the function that takes them off again. Never throws: if the effect
 * cannot start, nothing changes and the returned function does nothing. The library is loaded on demand, so
 * devices that cannot use it never download it.
 */
export async function startLiquidGlass(win: Window = window): Promise<() => void> {
  if (!LIQUID_GLASS.enabled || !canUseLiquidGlass(win)) return nothing;
  if (!win.matchMedia(LIQUID_GLASS.phoneQuery).matches) return nothing;
  if (!win.document.querySelector(LIQUID_GLASS.target)) return nothing;

  let lenses: LiquidGlassLens[];
  try {
    const { default: liquidGL } = await import('liquid-gl');
    // The page may have changed while the library loaded.
    if (!win.document.querySelector(LIQUID_GLASS.target)) return nothing;
    const made = liquidGL({
      ...LIQUID_GLASS.options,
      target: LIQUID_GLASS.target,
      snapshot: LIQUID_GLASS.snapshot,
    });
    lenses = made === undefined ? [] : Array.isArray(made) ? made : [made];
  } catch {
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
  };
}
