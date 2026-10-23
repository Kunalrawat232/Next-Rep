import { describe, expect, it } from 'vitest';
import {
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

describe('QA parseNumber: hostile typed text', () => {
  const cases: [string, number | null][] = [
    ['', null],
    ['   ', null],
    ['.', null],
    [',', null],
    ['5.', 5],
    ['.5', 0.5],
    [',5', 0.5],
    ['0,5', 0.5],
    ['62,5', 62.5],
    ['1,5,5', null],
    ['1,234.5', null],
    ['1.234,5', null],
    ['1,000', null],
    ['+5', null],
    ['-5', null],
    ['5 Kg', null],
    ['1 000', null],
    ['1.2.3', null],
    ['NaN', null],
    ['Infinity', null],
    ['1e3', null],
    ['0x10', null],
    // Digits that are not ASCII must never be read as a weight.
    ['５０', null],
    ['٣', null],
    ['1_0', null],
    ['9'.repeat(400), null],
    ['007', 7],
    ['  60  ', 60],
    ['60.004', 60],
    ['60.126', 60.13],
  ];
  it.each(cases)('reads %j as %j', (text, expected) => {
    expect(parseNumber(text)).toBe(expected);
  });
});

describe('QA round trips never drift a stored weight', () => {
  it('a field started from any stored hundredth of a kg, left alone, gives back that exact kg in both units', () => {
    const drifted: number[] = [];
    for (let h = 0; h <= 50_000; h += 1) {
      const kg = h / 100;
      for (const unit of ['kg', 'lb'] as const)
        if (kgFromField(fieldFromKg(kg, unit), unit) !== kg) drifted.push(kg);
    }
    expect(drifted).toEqual([]);
  });

  it('a lb weight typed to one decimal always shows back as typed (0 to 1102.3 Lb)', () => {
    const bad: number[] = [];
    for (let tenths = 0; tenths <= 11_023; tenths += 1) {
      const lb = tenths / 10;
      if (toDisplay(fromDisplay(lb, 'lb'), 'lb') !== lb) bad.push(lb);
    }
    expect(bad).toEqual([]);
  });

  it('a field whose text was edited and then typed back to the original text still means the stored kg', () => {
    const field = fieldFromKg(60, 'lb');
    expect(field.text).toBe('132.3');
    expect(kgFromField({ ...field, text: '132.3 ' }, 'lb')).toBe(60);
  });

  it('a field edited to a different number forgets the stored value', () => {
    const field = fieldFromKg(60, 'lb');
    expect(kgFromField({ ...field, text: '132.4' }, 'lb')).toBe(fromDisplay(132.4, 'lb'));
    expect(kgFromField({ ...field, text: '132.4' }, 'lb')).not.toBe(60);
  });

  it('a comma decimal in the field is the same weight as the dot', () => {
    expect(kgFromField(fieldFromText('62,5'), 'kg')).toBe(62.5);
    expect(kgFromField(fieldFromText('62.5'), 'kg')).toBe(62.5);
  });

  it('a kg field read in the wrong unit would be a different weight, which is why a new unit must start a new field', () => {
    // Documents the trap: "60" typed in kg means 27.22 kg if it is ever read as lb.
    expect(kgFromField(fieldFromKg(60, 'kg'), 'lb')).toBe(27.22);
  });

  it('shows no exponent or float dust for the awkward values', () => {
    const awkward = [0.1 + 0.2, 1.005, 8.325, 0.01, 0.005, 499.995, 1e-7, 123456.789];
    for (const kg of awkward)
      for (const unit of ['kg', 'lb'] as const)
        expect(formatWeight(kg, unit)).toMatch(/^\d+(\.\d{1,2})?$/);
  });

  it('never shows "-0"', () => {
    expect(formatWeight(-0.004, 'kg')).toBe('0');
    expect(formatWeight(-0.004, 'lb')).toBe('0');
    expect(withUnit(0, 'lb')).toBe('0 Lb');
  });
});

describe('QA maxDisplay', () => {
  it('shows 250 Kg as 551.1 Lb (rounded down) and 500 Kg as 1102.3 Lb', () => {
    expect(maxDisplay(250, 'lb')).toBe(551.1);
    expect(maxDisplay(500, 'lb')).toBe(1102.3);
    expect(maxDisplay(100, 'lb')).toBe(220.4);
  });
});
