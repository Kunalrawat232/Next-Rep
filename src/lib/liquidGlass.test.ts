import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const destroy = vi.fn();
const liquidGL = vi.fn<(options: unknown) => unknown>(() => ({ destroy }));
vi.mock('liquid-gl', () => ({ default: (options: unknown) => liquidGL(options) }));

import { canUseLiquidGlass, LIQUID_GLASS, startLiquidGlass } from './liquidGlass';

type Env = {
  transparency?: boolean;
  contrast?: boolean;
  phone?: boolean;
  webgl?: boolean | 'throws';
};

/** A window-like object: only what liquidGlass.ts reads. */
function windowWith({
  transparency = false,
  contrast = false,
  phone = true,
  webgl = true,
}: Env = {}) {
  const target = { matches: true };
  const doc = {
    createElement: () => ({
      getContext: () => {
        if (webgl === 'throws') throw new Error('no context');
        return webgl ? {} : null;
      },
    }),
    querySelector: vi.fn(() => target),
  };
  const win = {
    document: doc,
    matchMedia: (query: string) => ({
      matches: query.includes('reduced-transparency')
        ? transparency
        : query.includes('prefers-contrast')
          ? contrast
          : query === LIQUID_GLASS.phoneQuery
            ? phone
            : false,
    }),
    ...(webgl === false ? {} : { WebGLRenderingContext: class {} }),
  };
  return win as unknown as Window & { document: { querySelector: ReturnType<typeof vi.fn> } };
}

beforeEach(() => {
  destroy.mockClear();
  liquidGL.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('canUseLiquidGlass', () => {
  it('is true with WebGL and no request for less transparency or more contrast', () => {
    expect(canUseLiquidGlass(windowWith())).toBe(true);
  });

  it.each([
    ['less transparency was asked for', { transparency: true }],
    ['more contrast was asked for', { contrast: true }],
    ['there is no WebGL support at all', { webgl: false as const }],
    ['a context cannot be made', { webgl: 'throws' as const }],
  ])('is false when %s', (_name, env) => {
    expect(canUseLiquidGlass(windowWith(env))).toBe(false);
  });

  it('is false where a browser has no matchMedia and no WebGL (such as the test environment)', () => {
    expect(canUseLiquidGlass({ document, matchMedia: undefined } as unknown as Window)).toBe(false);
  });
});

describe('startLiquidGlass', () => {
  it('puts a lens on the target, refracting the ambient layer, with the one config', async () => {
    const undo = await startLiquidGlass(windowWith());
    expect(liquidGL).toHaveBeenCalledTimes(1);
    expect(liquidGL).toHaveBeenCalledWith({
      ...LIQUID_GLASS.options,
      target: LIQUID_GLASS.target,
      snapshot: '#ambient',
    });
    undo();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a wide screen, where the button does not exist', async () => {
    const undo = await startLiquidGlass(windowWith({ phone: false }));
    expect(liquidGL).not.toHaveBeenCalled();
    expect(() => undo()).not.toThrow();
  });

  it('does nothing when the device cannot use it, and never loads the library', async () => {
    await startLiquidGlass(windowWith({ webgl: false }));
    await startLiquidGlass(windowWith({ transparency: true }));
    expect(liquidGL).not.toHaveBeenCalled();
  });

  it('does nothing when there is no element to glass', async () => {
    const win = windowWith();
    win.document.querySelector.mockReturnValue(null);
    await startLiquidGlass(win);
    expect(liquidGL).not.toHaveBeenCalled();
  });

  it('takes off every lens when the library made several', async () => {
    liquidGL.mockReturnValueOnce([{ destroy }, { destroy }]);
    const undo = await startLiquidGlass(windowWith());
    undo();
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it('copes with a library that made no lens', async () => {
    liquidGL.mockReturnValueOnce(undefined);
    const undo = await startLiquidGlass(windowWith());
    expect(() => undo()).not.toThrow();
  });

  it('never throws when the library throws, and leaves the page as it is', async () => {
    liquidGL.mockImplementationOnce(() => {
      throw new TypeError('zIndex');
    });
    const undo = await startLiquidGlass(windowWith());
    expect(() => undo()).not.toThrow();
  });

  it('keeps taking lenses off when one will not come off', async () => {
    const stubborn = vi.fn(() => {
      throw new Error('already gone');
    });
    liquidGL.mockReturnValueOnce([{ destroy: stubborn }, { destroy }]);
    const undo = await startLiquidGlass(windowWith());
    expect(() => undo()).not.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('is switched off for good by the one flag', () => {
    expect(LIQUID_GLASS.enabled).toBe(true);
    expect(LIQUID_GLASS.options.zIndex).toBe(10);
  });
});
