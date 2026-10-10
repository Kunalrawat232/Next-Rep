// QA pass: boundaries and hostile numbers for the rest rules. Not a duplicate of index.test.ts: these are exact edges.
import { describe, expect, it } from 'vitest';
import {
  REST_MAX,
  REST_STALE_AFTER,
  extendRest,
  formatRest,
  isRestOver,
  isRestStale,
  parseCustomRest,
  remainingSeconds,
  startRest,
} from '.';

const NOW = 1_800_000_000_000;

describe('remainingSeconds rounding edges', () => {
  it.each([
    [0, 0],
    [-1, 0],
    [1, 1],
    [999, 1],
    [1000, 1],
    [1001, 2],
    [59_001, 60],
    [900_000, 900],
    [-86_400_000, 0],
  ])('%j ms to go shows %j s', (msToGo, expected) => {
    expect(remainingSeconds(NOW + msToGo, NOW)).toBe(expected);
  });

  it('is over at exactly the end time and not a millisecond before', () => {
    expect(isRestOver(NOW, NOW)).toBe(true);
    expect(isRestOver(NOW + 1, NOW)).toBe(false);
  });

  it('shows 0:00 only when the rest is over, never one tick early', () => {
    for (const msToGo of [1, 250, 999]) {
      const ends = NOW + msToGo;
      expect(isRestOver(ends, NOW)).toBe(false);
      expect(formatRest(remainingSeconds(ends, NOW))).toBe('0:01');
    }
  });

  it('keeps millisecond precision when a rest starts, for a fractional length', () => {
    expect(startRest(NOW, 0.5)).toBe(NOW + 500);
    expect(startRest(NOW, 0)).toBe(NOW);
  });
});

describe('extendRest with a clock that moved', () => {
  it.each([
    ['rest ended five minutes ago: counts from now', NOW - 300_000, 30, NOW + 30_000],
    ['rest 890 s to go: capped at the longest rest', NOW + 890_000, 30, NOW + REST_MAX * 1000],
    [
      'already exactly at the longest rest: stays there',
      NOW + REST_MAX * 1000,
      30,
      NOW + REST_MAX * 1000,
    ],
    [
      'clock rewound two hours (end far ahead): pulled back to the cap',
      NOW + 7_200_000,
      30,
      NOW + REST_MAX * 1000,
    ],
    ['a custom length is honoured', NOW + 10_000, 45, NOW + 55_000],
    ['zero seconds on a running rest changes nothing', NOW + 10_000, 0, NOW + 10_000],
  ])('%s', (_name, endsAt, seconds, expected) => {
    expect(extendRest(endsAt, NOW, seconds)).toBe(expected);
  });

  it('never moves a rest earlier than where it was, while it is under the cap', () => {
    for (const toGo of [1, 30, 500, 869])
      expect(extendRest(NOW + toGo * 1000, NOW)).toBeGreaterThan(NOW + toGo * 1000);
  });
});

describe('isRestStale exact edges', () => {
  it.each([
    ['exactly the longest rest ahead', NOW + REST_MAX * 1000, false],
    ['one ms past the longest rest ahead', NOW + REST_MAX * 1000 + 1, true],
    ['over for exactly an hour', NOW - REST_STALE_AFTER * 1000, false],
    ['over for an hour and a millisecond', NOW - REST_STALE_AFTER * 1000 - 1, true],
    ['ends right now', NOW, false],
    ['epoch zero', 0, true],
    ['negative', -5, true],
    ['max safe integer', Number.MAX_SAFE_INTEGER, true],
  ])('%s', (_name, endsAt, stale) => {
    expect(isRestStale(endsAt, NOW)).toBe(stale);
  });

  // BUG: src/domain/rest/index.ts:34 NaN is "a stored end time that cannot be a real rest" but both comparisons are false, so it is kept.
  it('treats NaN as stale', () => {
    expect(isRestStale(Number.NaN, NOW)).toBe(true);
  });
});

describe('formatRest edges', () => {
  it.each([
    [0, '0:00'],
    [59, '0:59'],
    [60, '1:00'],
    [61, '1:01'],
    [599, '9:59'],
    [900, '15:00'],
    [3599, '59:59'],
    [3600, '60:00'],
    [59.9, '0:59'],
    [-1, '0:00'],
    [-0.5, '0:00'],
  ])('%j seconds reads %j', (seconds, text) => {
    expect(formatRest(seconds)).toBe(text);
  });

  // BUG: src/domain/rest/index.ts:41 and :20 NaN flows through unchanged: remainingSeconds(NaN) is NaN and formatRest(NaN) is "NaN:NaN".
  it('never prints NaN on the pill', () => {
    expect(formatRest(remainingSeconds(Number.NaN, NOW))).toBe('0:00');
  });
});

describe('parseCustomRest hostile text', () => {
  it.each([
    ['30', 30],
    ['900', 900],
    [' 75 ', 75],
    ['75\n', 75],
    ['\t90', 90],
    ['030', 30],
    ['0000900', 900],
  ])('accepts %j as %j seconds', (text, seconds) => {
    expect(parseCustomRest(text)).toEqual({ ok: true, seconds });
  });

  it.each([
    '+75',
    '-75',
    '75.0',
    '7 5',
    '1,5',
    '1_000',
    '0x4B',
    '1e2',
    '７５',
    '75s',
    'seventy five',
    'पचहत्तर',
    '75​',
    '٧٥',
  ])('refuses %j as not whole seconds', (text) => {
    const result = parseCustomRest(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/whole seconds/);
  });

  it.each(['0', '29', '901', '9'.repeat(400), '99999999999999999999'])(
    'refuses %j as out of range, with the range in the message',
    (text) => {
      const result = parseCustomRest(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toBe('Rest must be 30 to 900 seconds.');
    },
  );
});
