import { describe, expect, it } from 'vitest';
import { toKg } from '../weight';
import {
  ENTRY_STEP,
  PLATE_STEP,
  fieldFromKg,
  fieldFromText,
  formatWeight,
  fromDisplay,
  kgFromField,
  maxDisplay,
  parseNumber,
  toDisplay,
  withUnit,
} from '.';

describe('toDisplay and fromDisplay', () => {
  it.each([
    [0, 'kg', 0],
    [60, 'kg', 60],
    [61.23, 'kg', 61.23],
    [60, 'lb', 132.3],
    [20, 'lb', 44.1],
    [15, 'lb', 33.1],
    [61.23, 'lb', 135],
    [500, 'lb', 1102.3],
  ] as const)('shows %s kg in %s as %s', (kg, unit, shown) => {
    expect(toDisplay(kg, unit)).toBe(shown);
  });

  it.each([
    [135, 'lb', 61.23],
    [45, 'lb', 20.41],
    [225, 'lb', 102.06],
    [100, 'kg', 100],
    [62.5, 'kg', 62.5],
    [0, 'lb', 0],
  ] as const)('stores %s %s as %s kg', (value, unit, kg) => {
    expect(fromDisplay(value, unit)).toBe(kg);
  });

  it('shows every lb weight typed to one decimal exactly as typed (0 to 1102.3 lb)', () => {
    for (let tenths = 0; tenths <= 11023; tenths += 1) {
      const lb = tenths / 10;
      expect(toDisplay(fromDisplay(lb, 'lb'), 'lb')).toBe(lb);
    }
  });

  it('shows every kg weight typed to two decimals exactly as typed (0 to 500 kg)', () => {
    for (let hundredths = 0; hundredths <= 50000; hundredths += 7) {
      const kg = hundredths / 100;
      expect(toDisplay(fromDisplay(kg, 'kg'), 'kg')).toBe(kg);
    }
  });

  it('never stores more than two decimals', () => {
    for (let tenths = 0; tenths <= 11023; tenths += 13) {
      const kg = fromDisplay(tenths / 10, 'lb');
      expect(Math.round(kg * 100) / 100).toBe(kg);
    }
  });
});

describe('formatting', () => {
  it.each([
    [60, 'kg', '60'],
    [62.5, 'kg', '62.5'],
    [60, 'lb', '132.3'],
    [20.41, 'lb', '45'],
    [0, 'lb', '0'],
  ] as const)('formats %s kg in %s as %s', (kg, unit, text) => {
    expect(formatWeight(kg, unit)).toBe(text);
  });

  it('adds the unit', () => {
    expect(withUnit(60, 'kg')).toBe('60 kg');
    expect(withUnit(61.23, 'lb')).toBe('135 lb');
  });
});

describe('steps and plates', () => {
  it('has real plate sizes for each unit', () => {
    expect(PLATE_STEP).toEqual({ kg: 1.25, lb: 2.5 });
    expect(ENTRY_STEP.total).toEqual({ kg: 2.5, lb: 5 });
    expect(ENTRY_STEP.per_side).toEqual({ kg: 1.25, lb: 2.5 });
  });
});

describe('parseNumber', () => {
  it.each([
    ['62.5', 62.5],
    ['62,5', 62.5],
    ['.5', 0.5],
    ['7.', 7],
    [' 60 ', 60],
    ['0', 0],
    ['20,25', 20.25],
    ['135.555', 135.56],
  ])('reads %j as %s', (text, value) => {
    expect(parseNumber(text)).toBe(value);
  });

  it.each([
    '',
    ' ',
    '1,000',
    '1e3',
    '0x10',
    '-5',
    '+5',
    'abc',
    '6 0',
    '1,2,3',
    '٦٠',
    'Infinity',
    '99999999999999999999999999999999999999999999'.concat('e999'),
  ])('refuses %j', (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe('a field that starts from a stored weight', () => {
  const stored = [0, 15, 20, 20.41, 60, 61.23, 62.5, 100, 102.06, 227.5, 500];

  it.each(stored)('keeps %s kg exactly when it is shown in lb and saved untouched', (kg) => {
    const field = fieldFromKg(kg, 'lb');
    expect(kgFromField(field, 'lb')).toBe(kg);
  });

  it.each(stored)('keeps %s kg exactly in kg', (kg) => {
    expect(kgFromField(fieldFromKg(kg, 'kg'), 'kg')).toBe(kg);
  });

  it('would change 60 kg to 60.01 kg without the stored value', () => {
    expect(fromDisplay(toDisplay(60, 'lb'), 'lb')).toBe(60.01);
    expect(kgFromField(fieldFromKg(60, 'lb'), 'lb')).toBe(60);
  });

  it('converts what was typed once the text is changed', () => {
    const field = { ...fieldFromKg(60, 'lb'), text: '135' };
    expect(kgFromField(field, 'lb')).toBe(61.23);
  });

  it('converts typed text when there is no stored value', () => {
    expect(kgFromField(fieldFromText('135'), 'lb')).toBe(61.23);
    expect(kgFromField(fieldFromText('62,5'), 'kg')).toBe(62.5);
  });

  it('is empty or invalid when the text is', () => {
    expect(kgFromField(fieldFromText(''), 'kg')).toBeNull();
    expect(kgFromField({ text: '', origin: 60 }, 'kg')).toBeNull();
    expect(kgFromField(fieldFromText('1,000'), 'lb')).toBeNull();
  });

  it('forgets the stored value when the unit changes, and shows the same weight', () => {
    // The text of a field made in kg is not the text of the same weight in lb.
    const field = { text: '60', origin: 60 };
    expect(kgFromField(field, 'lb')).toBe(fromDisplay(60, 'lb'));
  });
});

describe('maxDisplay', () => {
  it.each([
    [500, 'kg', 500],
    [500, 'lb', 1102.3],
    [250, 'lb', 551.1],
    [100, 'lb', 220.4],
  ] as const)('shows a limit of %s kg in %s as %s', (kg, unit, shown) => {
    expect(maxDisplay(kg, unit)).toBe(shown);
  });

  it('never shows a limit that is over the limit once converted back (0 to 1000 kg)', () => {
    for (let kg = 1; kg <= 1000; kg += 1) {
      expect(fromDisplay(maxDisplay(kg, 'lb'), 'lb')).toBeLessThanOrEqual(kg);
      // And it is the largest such number to one decimal.
      expect(fromDisplay(maxDisplay(kg, 'lb') + 0.1, 'lb')).toBeGreaterThan(kg - 0.0001);
    }
  });
});

describe('the same arithmetic as toKg in weight/', () => {
  it('converts lb to kg the same way, so the two cannot drift apart', () => {
    for (let tenths = 0; tenths <= 11023; tenths += 3) {
      const lb = tenths / 10;
      expect(fromDisplay(lb, 'lb')).toBe(toKg(lb, 'lb'));
    }
  });
});
