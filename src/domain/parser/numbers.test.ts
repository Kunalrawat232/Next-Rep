import { describe, expect, it } from 'vitest';
import { numberAt, mergeNumbers } from './numbers';
import { tokenize } from './tokens';

const read = (text: string) => numberAt(tokenize(text), 0)?.value;

describe('tokenize', () => {
  it('lowercases, drops punctuation and splits numbers from letters', () => {
    expect(tokenize('Bench-Press, 62.5kg x8!')).toEqual(['bench', 'press', '62.5', 'kg', 'x', '8']);
  });

  it('keeps a decimal point only between digits', () => {
    expect(tokenize('60. 8.')).toEqual(['60', '8']);
    expect(tokenize('.5')).toEqual(['0.5']);
  });

  it('returns nothing for empty or symbol-only text', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('?!…')).toEqual([]);
  });
});

describe('numberAt', () => {
  it.each([
    ['60', 60],
    ['62.5', 62.5],
    ['sixty', 60],
    ['sixty two', 62],
    ['twelve', 12],
    ['nineteen', 19],
    ['one hundred', 100],
    ['a hundred', 100],
    ['a hundred and twenty five', 125],
    ['five hundred', 500],
    ['two twenty five', 225],
    ['one forty', 140],
    ['sixty two point five', 62.5],
    ['sixty two point two five', 62.25],
    ['sixty two point 5', 62.5],
    ['sixty two and a half', 62.5],
    ['sixty two and half', 62.5],
    ['zero', 0],
  ])('%s is %s', (text, value) => {
    expect(read(text)).toBe(value);
  });

  it.each([
    ['ek', 1],
    ['do', 2],
    ['teen', 3],
    ['chaar', 4],
    ['paanch', 5],
    ['chhe', 6],
    ['saat', 7],
    ['aath', 8],
    ['nau', 9],
    ['das', 10],
    ['gyaarah', 11],
    ['baarah', 12],
    ['terah', 13],
    ['chaudah', 14],
    ['pandrah', 15],
    ['solah', 16],
    ['satrah', 17],
    ['athaarah', 18],
    ['unnees', 19],
    ['bees', 20],
    ['panch', 5],
    ['dus', 10],
    ['unnis', 19],
  ])('Hindi %s is %s', (text, value) => {
    expect(read(text)).toBe(value);
  });

  it('reads a Hindi number as one word, not as part of an English number', () => {
    expect(numberAt(['sixty', 'do'], 0)).toEqual({ value: 60, end: 1 });
    expect(numberAt(['do', 'point', 'five'], 0)).toEqual({ value: 2, end: 1 });
  });

  it('stops where the number ends', () => {
    expect(numberAt(['sixty', 'two', 'kg'], 0)).toEqual({ value: 62, end: 2 });
    expect(numberAt(['sixty', 'sixty'], 0)).toEqual({ value: 60, end: 1 });
    expect(numberAt(['five', 'six'], 0)).toEqual({ value: 5, end: 1 });
  });

  it('does not read words that are not numbers, or very long digit strings', () => {
    expect(read('bench')).toBeUndefined();
    expect(read('and')).toBeUndefined();
    expect(read('1234567890')).toBeUndefined();
    expect(read('point five')).toBeUndefined();
  });

  it('does not add a half to a decimal', () => {
    expect(numberAt(['62.5', 'and', 'a', 'half'], 0)).toEqual({ value: 62.5, end: 1 });
  });
});

describe('mergeNumbers', () => {
  it('folds a spoken number into one token and keeps the exercise place', () => {
    expect(mergeNumbers(['bench', 'press', 'sixty', 'two', 'kg'], new Set([1]), 0)).toEqual([
      { kind: 'exercise' },
      { kind: 'num', value: 62 },
      { kind: 'word', text: 'kg' },
    ]);
  });
});
