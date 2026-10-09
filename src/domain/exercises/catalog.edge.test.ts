import { describe, expect, it } from 'vitest';
import { parseExercises } from './catalog';
import curatedJson from '../exercises.seed.json';
import extendedJson from '../exercises.extended.json';

const row = (over: Record<string, unknown> = {}) => ({
  id: '2c49d84c-42d6-5729-8791-bdf87686998a',
  name: 'Barbell Bench Press',
  equipmentType: 'barbell',
  bodyPart: 'upper',
  muscle: 'chest',
  aliases: ['bench'],
  ...over,
});
const id = (n: number) => `2c49d84c-42d6-5729-8791-${n.toString().padStart(12, '0')}`;

describe('parseExercises edge: good rows', () => {
  it('accepts an empty list', () => {
    expect(parseExercises([], 'imported')).toEqual([]);
  });

  it('keeps a null muscle as null', () => {
    expect(parseExercises([row({ muscle: null })], 'curated')[0]?.muscle).toBeNull();
  });

  it('accepts the limits: 80 character name, 20 aliases, 60 character alias, no aliases', () => {
    const aliases = Array.from({ length: 20 }, (_, i) => `a${i}`.padEnd(60, 'x'));
    expect(parseExercises([row({ name: 'x'.repeat(80), aliases })], 'curated')).toHaveLength(1);
    expect(parseExercises([row({ aliases: [] })], 'curated')).toHaveLength(1);
  });

  it('drops unknown fields instead of passing them on', () => {
    const [e] = parseExercises(
      [row({ secret: 'x', extra: { a: 1 }, __proto__: { admin: true } })],
      'curated',
    );
    expect(Object.keys(e ?? {}).sort()).toEqual([
      'aliases',
      'bodyPart',
      'equipmentType',
      'id',
      'muscle',
      'name',
      'tier',
    ]);
  });

  it('sets the tier from the argument and never from the data', () => {
    const [e] = parseExercises([row({ tier: 'custom' })], 'imported');
    expect(e?.tier).toBe('imported');
  });

  it('keeps row order', () => {
    const rows = [
      row({ id: id(3), name: 'C' }),
      row({ id: id(1), name: 'A' }),
      row({ id: id(2), name: 'B' }),
    ];
    expect(parseExercises(rows, 'curated').map((e) => e.name)).toEqual(['C', 'A', 'B']);
  });

  it('does not change the input', () => {
    const input = [row()];
    const copy = JSON.stringify(input);
    parseExercises(input, 'curated');
    expect(JSON.stringify(input)).toBe(copy);
  });

  it('accepts the bundled files with every row marked', () => {
    expect(parseExercises(curatedJson, 'curated').every((e) => e.tier === 'curated')).toBe(true);
    expect(parseExercises(extendedJson, 'imported').every((e) => e.tier === 'imported')).toBe(true);
  });
});

describe('parseExercises edge: bad input is rejected', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
    ['a string', 'rows'],
    ['a number', 42],
    ['a list with null', [null]],
    ['a list with a string', ['x']],
    ['a nested list', [[row()]]],
  ])('throws for %s', (_l, raw) => {
    expect(() => parseExercises(raw, 'curated')).toThrow();
  });

  it.each([
    ['unknown equipment', { equipmentType: 'kettlebell' }],
    ['equipment in the wrong case', { equipmentType: 'Barbell' }],
    ['equipment with the chip label', { equipmentType: 'EZ bar' }],
    ['missing equipment', { equipmentType: undefined }],
    ['unknown body part', { bodyPart: 'arms' }],
    ['body part in the wrong case', { bodyPart: 'Upper' }],
    ['unknown muscle', { muscle: 'neck' }],
    ['muscle label instead of key', { muscle: 'Upper back' }],
    ['muscle missing (not null)', { muscle: undefined }],
    ['muscle as empty string', { muscle: '' }],
    ['id not a uuid', { id: 'abc' }],
    ['id empty', { id: '' }],
    ['id a number', { id: 7 }],
    ['id missing', { id: undefined }],
    ['name empty', { name: '' }],
    ['name 81 characters', { name: 'x'.repeat(81) }],
    ['name a number', { name: 5 }],
    ['name null', { name: null }],
    ['aliases null', { aliases: null }],
    ['aliases missing', { aliases: undefined }],
    ['aliases a string', { aliases: 'bench, press' }],
    ['21 aliases', { aliases: Array.from({ length: 21 }, (_, i) => `a${i}`) }],
    ['an empty alias', { aliases: ['ok', ''] }],
    ['a 61 character alias', { aliases: ['x'.repeat(61)] }],
    ['a non-string alias', { aliases: ['ok', 7] }],
    ['a null alias', { aliases: [null] }],
  ])('throws for %s', (_l, over) => {
    expect(() => parseExercises([row(over)], 'curated')).toThrow();
  });

  it('rejects the whole list when one row among many is bad', () => {
    const rows = [row({ id: id(1), name: 'A' }), row({ id: id(2), name: 'B', muscle: 'neck' })];
    expect(() => parseExercises(rows, 'curated')).toThrow();
  });
});

describe('parseExercises edge: data the schema should not let through', () => {
  it('rejects two rows with the same id', () => {
    expect(() => parseExercises([row({ name: 'A' }), row({ name: 'B' })], 'curated')).toThrow();
  });

  it('rejects two rows with the same name apart from case or spacing', () => {
    expect(() =>
      parseExercises(
        [row({ id: id(1), name: 'Row' }), row({ id: id(2), name: ' ROW ' })],
        'curated',
      ),
    ).toThrow();
  });

  it('rejects a name that is only spaces', () => {
    expect(() => parseExercises([row({ name: '   ' })], 'curated')).toThrow();
  });

  it('rejects an alias that is only spaces', () => {
    expect(() => parseExercises([row({ aliases: ['  '] })], 'curated')).toThrow();
  });

  it('rejects a list of aliases that repeats itself', () => {
    expect(() => parseExercises([row({ aliases: ['bench', 'Bench'] })], 'curated')).toThrow();
  });
});
