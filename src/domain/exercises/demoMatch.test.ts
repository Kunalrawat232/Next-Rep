import { describe, expect, it } from 'vitest';
import { matchDemos, normalizeName } from './demoMatch';

describe('normalizeName', () => {
  it.each([
    ['Barbell Curl', 'barbell curl'],
    ['  BARBELL   curl ', 'barbell curl'],
    ['Barbell Curl (Barbell)', 'barbell curl'],
    ['Bench Press (with arm blaster)', 'bench press'],
    ['Close-Grip Bench Press', 'close grip bench press'],
    ["Farmer's Walk", 'farmers walk'],
    ['3/4 Sit-Up', '3 4 sit up'],
    ['Crème Brûlée Row', 'creme brulee row'],
    ['(Barbell)', ''],
  ])('%s -> %s', (name, key) => {
    expect(normalizeName(name)).toBe(key);
  });
});

const row = (id: string, name: string) => ({ id, name });
const dataset = [
  row('0001', 'barbell curl'),
  row('0002', 'Close-Grip Bench Press'),
  row('0003', 'cable fly'),
  row('0004', 'Cable Fly (Low)'),
  row('0005', 'lat pulldown'),
];
const ourIdFor = (r: { id: string }) => `ours-${r.id}`;

describe('matchDemos', () => {
  it('matches by the id our import gave, before looking at names', () => {
    const report = matchDemos([{ id: 'ours-0005', name: 'Wide Lat Thing' }], dataset, { ourIdFor });
    expect(report.matched).toMatchObject([{ how: 'id', row: { id: '0005' } }]);
  });

  it('matches by normalised name, ignoring case, punctuation and suffixes', () => {
    const report = matchDemos(
      [
        { id: 'a', name: 'Barbell Curl (Barbell)' },
        { id: 'b', name: 'Close Grip Bench Press' },
      ],
      dataset,
      { ourIdFor },
    );
    expect(report.matched.map((m) => [m.ours.id, m.row.id, m.how])).toEqual([
      ['a', '0001', 'name'],
      ['b', '0002', 'name'],
    ]);
  });

  it('never guesses: a name several rows share is ambiguous and gets no demo', () => {
    const rows = [row('3', 'Cable Fly (high)'), row('4', 'cable fly (low)')];
    const report = matchDemos([{ id: 'a', name: 'Cable Fly' }], rows, { ourIdFor });
    expect(report.matched).toEqual([]);
    expect(report.ambiguous).toHaveLength(1);
    expect(report.ambiguous[0]?.rows.map((r) => r.id)).toEqual(['3', '4']);
  });

  it('picks the row whose own name is exactly ours when several share the normalised name', () => {
    const rows = [
      row('1', 'pull up (neutral grip)'),
      row('2', 'pull-up'),
      row('3', 'Pull Up (wide)'),
    ];
    const report = matchDemos([{ id: 'a', name: 'Pull-Up' }], rows, { ourIdFor });
    expect(report.matched).toMatchObject([{ how: 'name', row: { id: '2' } }]);
    const none = matchDemos(
      [{ id: 'a', name: 'Pull Up' }],
      [row('1', 'pull up (a)'), row('2', 'pull up (b)')],
      { ourIdFor },
    );
    expect(none.ambiguous).toHaveLength(1);
  });

  it('does not pick when two rows have the same exact name', () => {
    const rows = [row('1', 'lever chest press'), row('2', 'lever chest press')];
    expect(
      matchDemos([{ id: 'a', name: 'Lever Chest Press' }], rows, { ourIdFor }).ambiguous,
    ).toHaveLength(1);
  });

  it('does not trust a lone row that names a variant ours does not', () => {
    const rows = [
      row('1', 'standing calf raise (on a staircase)'),
      row('2', 'bench press (with arm blaster)'),
    ];
    for (const name of ['Standing Calf Raise', 'Bench Press']) {
      const report = matchDemos([{ id: 'a', name }], rows, { ourIdFor });
      expect(report.matched).toEqual([]);
      expect(report.ambiguous).toHaveLength(1);
    }
  });

  it('accepts a lone row when the notes agree, or when only our name carries one', () => {
    const rows = [row('1', 'barbell curl'), row('2', 'cable fly (low)')];
    const report = matchDemos(
      [
        { id: 'a', name: 'Cable Fly (Low)' },
        { id: 'b', name: 'Barbell Curl (Barbell)' },
      ],
      rows,
      { ourIdFor },
    );
    expect(report.matched.map((m) => [m.ours.id, m.row.id])).toEqual([
      ['a', '2'],
      ['b', '1'],
    ]);
  });

  it('lets a person decline a match, and the exercise gets no demo', () => {
    const report = matchDemos([{ id: 'a', name: 'Barbell Curl' }], dataset, {
      ourIdFor,
      overrides: { a: null },
    });
    expect(report.matched).toEqual([]);
    expect(report.declined).toEqual([{ id: 'a', name: 'Barbell Curl' }]);
  });

  it('reports what nothing matches', () => {
    const report = matchDemos([{ id: 'a', name: 'Zottman Curl' }], dataset, { ourIdFor });
    expect(report.unmatched).toEqual([{ id: 'a', name: 'Zottman Curl' }]);
  });

  it('lets a person decide an ambiguous or unmatched exercise', () => {
    const report = matchDemos(
      [
        { id: 'a', name: 'Cable Fly (Low)' },
        { id: 'b', name: 'Overhead Press' },
      ],
      dataset,
      { ourIdFor, overrides: { a: '0004', b: '0002' } },
    );
    expect(report.matched.map((m) => [m.ours.id, m.row.id, m.how])).toEqual([
      ['a', '0004', 'override'],
      ['b', '0002', 'override'],
    ]);
    expect(report.ambiguous).toEqual([]);
  });

  it('refuses an override that names a row that does not exist', () => {
    expect(() =>
      matchDemos([{ id: 'a', name: 'Cable Fly' }], dataset, { ourIdFor, overrides: { a: '9999' } }),
    ).toThrow(/does not exist/);
  });

  it('does not match two blank names to each other', () => {
    const report = matchDemos([{ id: 'a', name: '(Barbell)' }], [row('1', '(Cable)')], {
      ourIdFor,
    });
    expect(report.matched).toEqual([]);
  });

  it('puts every exercise in exactly one list', () => {
    const ours = [
      { id: 'ours-0001', name: 'X' },
      { id: 'b', name: 'Cable Fly' },
      { id: 'c', name: 'Nope' },
      { id: 'd', name: 'Lat Pulldown' },
    ];
    const r = matchDemos(ours, dataset, { ourIdFor });
    expect(r.matched.length + r.ambiguous.length + r.declined.length + r.unmatched.length).toBe(
      ours.length,
    );
  });
});
