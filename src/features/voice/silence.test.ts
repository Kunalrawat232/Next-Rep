import { describe, expect, it } from 'vitest';
import { createSilenceDetector } from './silence';

describe('createSilenceDetector', () => {
  it('never stops before anything was said, however quiet it is', () => {
    const detector = createSilenceDetector();
    for (let t = 0; t < 10_000; t += 100) expect(detector.feed(0.01, t)).toBe(false);
  });

  it('stops once speech was heard and it has been quiet long enough', () => {
    const detector = createSilenceDetector({ silenceMs: 1000 });
    expect(detector.feed(0.4, 500)).toBe(false);
    expect(detector.feed(0.3, 900)).toBe(false);
    expect(detector.feed(0.01, 1500)).toBe(false);
    expect(detector.feed(0.01, 1899)).toBe(false);
    expect(detector.feed(0.01, 1900)).toBe(true);
  });

  it('starts counting the quiet again whenever there is more speech', () => {
    const detector = createSilenceDetector({ silenceMs: 1000 });
    detector.feed(0.4, 0);
    expect(detector.feed(0.01, 900)).toBe(false);
    expect(detector.feed(0.5, 950)).toBe(false);
    expect(detector.feed(0.01, 1900)).toBe(false);
    expect(detector.feed(0.01, 1950)).toBe(true);
  });

  it('counts a level exactly at the limit as speech', () => {
    const detector = createSilenceDetector({ speechLevel: 0.1, silenceMs: 100 });
    expect(detector.feed(0.1, 0)).toBe(false);
    expect(detector.feed(0, 100)).toBe(true);
  });
});
