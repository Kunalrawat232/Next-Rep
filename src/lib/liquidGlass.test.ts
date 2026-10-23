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
  const doc = {
    createElement: () => ({
      getContext: () => {
        if (webgl === 'throws') throw new Error('no context');
        return webgl ? {} : null;
      },
    }),
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
  return win as unknown as Window;
}

/** An element-like object: a connected element that records its attribute. */
function anElement(connected: () => boolean = () => true) {
  const attributes = new Map<string, string>();
  return {
    get isConnected() {
      return connected();
    },
    setAttribute: vi.fn((name: string, value: string) => void attributes.set(name, value)),
    removeAttribute: vi.fn((name: string) => void attributes.delete(name)),
    attribute: (name: string) => attributes.get(name),
  } as unknown as HTMLElement & { attribute: (name: string) => string | undefined };
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
  it('names the element, puts a lens on it refracting the ambient layer, and takes it off', async () => {
    const element = anElement();
    const undo = await startLiquidGlass(element, 'round', windowWith());
    expect(liquidGL).toHaveBeenCalledTimes(1);
    const options = liquidGL.mock.calls[0]![0] as Record<string, unknown>;
    expect(options).toMatchObject({ ...LIQUID_GLASS.presets.round, snapshot: '#ambient' });
    const mark = element.attribute('data-liquid');
    expect(mark).toMatch(/^lens-\d+$/);
    expect(options.target).toBe(`[data-liquid="${mark}"]`);
    undo();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(element.attribute('data-liquid')).toBeUndefined();
  });

  it('uses the preset it is given', async () => {
    await startLiquidGlass(anElement(), 'dock', windowWith());
    expect(liquidGL.mock.calls[0]![0]).toMatchObject(LIQUID_GLASS.presets.dock);
  });

  it('gives every element a name of its own', async () => {
    const a = anElement();
    const b = anElement();
    await startLiquidGlass(a, 'round', windowWith());
    await startLiquidGlass(b, 'round', windowWith());
    expect(a.attribute('data-liquid')).not.toBe(b.attribute('data-liquid'));
  });

  it('does nothing on a wide screen, where nothing is floating', async () => {
    const element = anElement();
    const undo = await startLiquidGlass(element, 'round', windowWith({ phone: false }));
    expect(liquidGL).not.toHaveBeenCalled();
    expect(element.attribute('data-liquid')).toBeUndefined();
    expect(() => undo()).not.toThrow();
  });

  it('does nothing when the device cannot use it, and never loads the library', async () => {
    await startLiquidGlass(anElement(), 'round', windowWith({ webgl: false }));
    await startLiquidGlass(anElement(), 'round', windowWith({ transparency: true }));
    expect(liquidGL).not.toHaveBeenCalled();
  });

  it('does nothing for an element that is not on the page', async () => {
    await startLiquidGlass(
      anElement(() => false),
      'round',
      windowWith(),
    );
    expect(liquidGL).not.toHaveBeenCalled();
  });

  it('does nothing, and leaves no name behind, when the element left while the library loaded', async () => {
    let checks = 0;
    const element = anElement(() => ++checks === 1);
    await startLiquidGlass(element, 'round', windowWith());
    expect(liquidGL).not.toHaveBeenCalled();
    expect(element.attribute('data-liquid')).toBeUndefined();
  });

  it('takes off every lens when the library made several', async () => {
    liquidGL.mockReturnValueOnce([{ destroy }, { destroy }]);
    const undo = await startLiquidGlass(anElement(), 'round', windowWith());
    undo();
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it('copes with a library that made no lens', async () => {
    liquidGL.mockReturnValueOnce(undefined);
    const undo = await startLiquidGlass(anElement(), 'round', windowWith());
    expect(() => undo()).not.toThrow();
  });

  it('never throws when the library throws, and leaves the page as it is', async () => {
    liquidGL.mockImplementationOnce(() => {
      throw new TypeError('bad option');
    });
    const element = anElement();
    const undo = await startLiquidGlass(element, 'round', windowWith());
    expect(() => undo()).not.toThrow();
    expect(element.attribute('data-liquid')).toBeUndefined();
  });

  it('keeps taking lenses off when one will not come off', async () => {
    const stubborn = vi.fn(() => {
      throw new Error('already gone');
    });
    liquidGL.mockReturnValueOnce([{ destroy: stubborn }, { destroy }]);
    const undo = await startLiquidGlass(anElement(), 'round', windowWith());
    expect(() => undo()).not.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('is switched off for good by the one flag', () => {
    expect(LIQUID_GLASS.enabled).toBe(true);
    expect(LIQUID_GLASS.snapshot).toBe('#ambient');
  });
});
