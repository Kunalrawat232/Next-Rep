import { describe, expect, it } from 'vitest';
import { REST_MAX, extendRest, formatRest, parseCustomRest, remainingSeconds, startRest } from '.';

/** A small seeded generator, so a failure can be repeated. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

describe('rest properties', () => {
  it('remaining never goes below 0 or above the length, and falls as time passes', () => {
    const next = random(7);
    for (let i = 0; i < 2000; i += 1) {
      const now = Math.floor(next() * 1e9);
      const seconds = 30 + Math.floor(next() * 871);
      const end = startRest(now, seconds);
      const a = Math.floor(next() * seconds * 1500);
      const b = a + Math.floor(next() * 5000);
      const first = remainingSeconds(end, now + a);
      const second = remainingSeconds(end, now + b);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThanOrEqual(seconds);
      expect(second).toBeLessThanOrEqual(first);
    }
  });

  it('extending never leaves more than 900 seconds, and never shortens a rest that is under it', () => {
    const next = random(11);
    for (let i = 0; i < 2000; i += 1) {
      const now = Math.floor(next() * 1e9);
      const end = startRest(now, 30 + Math.floor(next() * 871));
      const extended = extendRest(end, now);
      expect(remainingSeconds(extended, now)).toBeLessThanOrEqual(REST_MAX);
      expect(extended).toBeGreaterThanOrEqual(end);
    }
  });

  it('formats every length as m:ss and reads back to the same seconds', () => {
    for (let seconds = 0; seconds <= REST_MAX; seconds += 1) {
      const [m, s] = formatRest(seconds).split(':').map(Number);
      expect(m! * 60 + s!).toBe(seconds);
    }
  });

  it('accepts exactly the whole numbers 30 to 900', () => {
    for (let n = 0; n <= 1000; n += 1) {
      expect(parseCustomRest(String(n)).ok).toBe(n >= 30 && n <= 900);
    }
  });
});
