import { describe, expect, it } from 'vitest';
import {
  REST_EXTEND,
  REST_MAX,
  REST_MIN_CUSTOM,
  REST_STALE_AFTER,
  REST_PRESETS,
  extendRest,
  formatRest,
  isRestOver,
  isRestStale,
  parseCustomRest,
  remainingSeconds,
  startRest,
} from '.';

describe('rest presets', () => {
  it('are the four quick choices, all inside the custom range', () => {
    expect(REST_PRESETS).toEqual([60, 90, 120, 180]);
    expect(REST_PRESETS.every((p) => p >= REST_MIN_CUSTOM && p <= REST_MAX)).toBe(true);
  });
});

describe('startRest and remainingSeconds', () => {
  it('counts down from the full length', () => {
    const end = startRest(1_000, 90);
    expect(end).toBe(91_000);
    expect(remainingSeconds(end, 1_000)).toBe(90);
    expect(remainingSeconds(end, 31_000)).toBe(60);
  });

  it('rounds up, so the last part of a second still shows 1', () => {
    expect(remainingSeconds(10_000, 9_001)).toBe(1);
    expect(remainingSeconds(10_000, 9_999)).toBe(1);
    expect(remainingSeconds(10_000, 10_000)).toBe(0);
  });

  it('is never negative once the time has passed', () => {
    expect(remainingSeconds(10_000, 99_000)).toBe(0);
  });
});

describe('isRestOver', () => {
  it('is over at the end time, not before', () => {
    expect(isRestOver(10_000, 9_999)).toBe(false);
    expect(isRestOver(10_000, 10_000)).toBe(true);
    expect(isRestOver(10_000, 10_001)).toBe(true);
  });
});

describe('extendRest', () => {
  it('adds 30 seconds by default', () => {
    expect(extendRest(60_000, 0)).toBe(60_000 + REST_EXTEND * 1000);
  });

  it('never leaves more than 900 seconds to go', () => {
    expect(extendRest(890_000, 0)).toBe(REST_MAX * 1000);
    expect(extendRest(REST_MAX * 1000, 0)).toBe(REST_MAX * 1000);
  });
});

describe('extendRest when the rest is over or far ahead', () => {
  it('counts from now once the rest has ended', () => {
    expect(extendRest(10_000, 50_000)).toBe(80_000);
  });

  it('caps an end time that is further ahead than the longest rest', () => {
    expect(extendRest(5_000_000, 0)).toBe(REST_MAX * 1000);
  });
});

describe('isRestStale', () => {
  const now = 1_000_000_000;
  it('keeps a running rest and one that has just ended', () => {
    expect(isRestStale(now + 60_000, now)).toBe(false);
    expect(isRestStale(now + REST_MAX * 1000, now)).toBe(false);
    expect(isRestStale(now - 5_000, now)).toBe(false);
    expect(isRestStale(now - REST_STALE_AFTER * 1000, now)).toBe(false);
  });

  it('drops one further ahead than the longest rest, and one over for more than an hour', () => {
    expect(isRestStale(now + REST_MAX * 1000 + 1, now)).toBe(true);
    expect(isRestStale(8.64e15, now)).toBe(true);
    expect(isRestStale(now - REST_STALE_AFTER * 1000 - 1, now)).toBe(true);
  });
});

describe('formatRest', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [59, '0:59'],
    [60, '1:00'],
    [84, '1:24'],
    [600, '10:00'],
    [900, '15:00'],
    [-3, '0:00'],
  ])('%i seconds is %s', (seconds, text) => {
    expect(formatRest(seconds)).toBe(text);
  });
});

describe('parseCustomRest', () => {
  it.each([
    ['30', 30],
    ['75', 75],
    [' 90 ', 90],
    ['900', 900],
  ])('accepts %j', (text, seconds) => {
    expect(parseCustomRest(text)).toEqual({ ok: true, seconds });
  });

  it.each(['29', '901', '0', '5000'])('refuses %j as out of range', (text) => {
    const result = parseCustomRest(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('Rest must be 30 to 900 seconds.');
  });

  it.each(['', '  ', 'abc', '1.5', '-60', '60s', '1e2', '٦٠'])(
    'refuses %j as not whole seconds',
    (text) => {
      const result = parseCustomRest(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/whole seconds/);
    },
  );
});
