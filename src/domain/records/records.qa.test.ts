import { describe, expect, it } from 'vitest';
import { fromDisplay, toDisplay } from '../units';
import { breakdownFor, perSideShown, setSummary } from '../workout';
import { currentRecords, recordMarks, sessionBests } from '.';

const EX = 'ex-1';
let n = 0;
const set = (totalKg: number, reps: number, minute: number, exerciseId = EX, workoutId = 'w1') => ({
  id: `s${String((n += 1)).padStart(4, '0')}`,
  workoutId,
  exerciseId,
  totalKg,
  reps,
  loggedAt: `2026-10-10T10:${String(minute).padStart(2, '0')}:00.000Z`,
});

/** Marks in time order as a string such as "-,W,-,R", so a scenario reads at a glance. */
const marksString = (sets: ReturnType<typeof set>[]) => {
  const marks = recordMarks(sets);
  return [...sets]
    .sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : 1))
    .map((s) => (marks.has(s.id) ? (marks.get(s.id) === 'weight' ? 'W' : 'R') : '-'))
    .join(',');
};

describe('QA recordMarks scenarios', () => {
  const scenarios: [string, [number, number][], string][] = [
    ['first set is never a record', [[60, 8]], '-'],
    [
      'an equal repeat is not a record',
      [
        [60, 8],
        [60, 8],
        [60, 8],
      ],
      '-,-,-',
    ],
    [
      'a lighter set with fewer reps is not a record',
      [
        [60, 8],
        [50, 5],
      ],
      '-,-',
    ],
    [
      'a lighter set the first time at that weight is not a record, even with huge reps',
      [
        [60, 8],
        [50, 30],
      ],
      '-,-',
    ],
    [
      'more reps at an earlier weight is a rep record, even below the heaviest',
      [
        [60, 5],
        [80, 5],
        [60, 6],
      ],
      '-,W,R',
    ],
    [
      'going back to the same reps at a beaten weight is nothing',
      [
        [60, 5],
        [80, 5],
        [60, 6],
        [60, 6],
      ],
      '-,W,R,-',
    ],
    [
      'heavier with fewer reps is still a weight record',
      [
        [60, 12],
        [62.5, 1],
      ],
      '-,W',
    ],
    [
      'a rep record needs MORE reps, not equal to the best at that weight',
      [
        [60, 5],
        [60, 7],
        [60, 7],
        [60, 6],
      ],
      '-,R,-,-',
    ],
    [
      'a set is one kind only: heavier AND the first at that weight is W',
      [
        [60, 5],
        [65, 20],
      ],
      '-,W',
    ],
    [
      'bodyweight: 0 kg more reps is a rep record, never a weight record',
      [
        [0, 10],
        [0, 12],
        [0, 12],
      ],
      '-,R,-',
    ],
    [
      'bodyweight: added weight after plain reps is a weight record',
      [
        [0, 10],
        [5, 3],
      ],
      '-,W',
    ],
    [
      'float dust is the same weight',
      [
        [0.1 + 0.2, 5],
        [0.3, 6],
      ],
      '-,R',
    ],
    [
      'a hundredth of a kg heavier is a record',
      [
        [60, 5],
        [60.01, 1],
      ],
      '-,W',
    ],
  ];
  it.each(scenarios)('%s', (_name, rows, expected) => {
    expect(marksString(rows.map(([kg, reps], i) => set(kg, reps, i)))).toBe(expected);
  });

  it('has no marks for no sets', () => {
    expect(marksString([])).toBe('');
  });

  it('does not let another exercise at the same weight make a record', () => {
    const sets = [set(60, 5, 0, 'a'), set(60, 9, 1, 'b'), set(60, 6, 2, 'a'), set(100, 1, 3, 'b')];
    const marks = recordMarks(sets);
    expect(marks.get(sets[2]!.id)).toBe('reps');
    expect(marks.get(sets[3]!.id)).toBe('weight');
    expect(marks.has(sets[1]!.id)).toBe(false);
  });
});

describe('QA kg and lb: the same weight shown twice is not a record', () => {
  // BUG: 60 kg shows as 132.3 lb, and 132.3 lb typed converts to 60.01 kg, so a set that LOOKS the
  // same as the last one is marked as a weight record (compared in hundredths of a kg, not in the
  // unit shown). Hits anyone who logged in kg and then switched to lb (or back).
  it.fails('a weight typed in lb that shows the same as an earlier kg set is no record', () => {
    const shown = toDisplay(60, 'lb');
    const typedKg = fromDisplay(shown, 'lb');
    const marks = recordMarks([set(60, 8, 0), set(typedKg, 8, 1)]);
    expect(toDisplay(typedKg, 'lb')).toBe(shown);
    expect(marks.size).toBe(0);
  });

  it('the same lb weight typed twice is the same kg, so no record', () => {
    for (let tenths = 10; tenths <= 11_023; tenths += 7) {
      const kg = fromDisplay(tenths / 10, 'lb');
      expect(recordMarks([set(kg, 5, 0), set(fromDisplay(tenths / 10, 'lb'), 5, 1)]).size).toBe(0);
    }
  });

  it('heavier in lb (0.1 lb more) is always heavier in kg, so the record is real', () => {
    const wrong: number[] = [];
    for (let tenths = 1; tenths <= 11_022; tenths += 1) {
      const lo = fromDisplay(tenths / 10, 'lb');
      const hi = fromDisplay((tenths + 1) / 10, 'lb');
      if (!(hi > lo)) wrong.push(tenths / 10);
    }
    expect(wrong).toEqual([]);
  });
});

describe('QA sessionBests and currentRecords agree', () => {
  it('the heaviest record is the best of the session bests, whatever the order', () => {
    const sets = [
      set(60, 8, 0, EX, 'a'),
      set(65, 3, 1, EX, 'b'),
      set(65, 5, 2, EX, 'b'),
      set(62.5, 9, 3, EX, 'c'),
    ];
    const bests = sessionBests(sets);
    const heaviest = currentRecords(sets).heaviest!;
    expect(bests.map((b) => `${b.totalKg}x${b.reps}`)).toEqual(['60x8', '65x5', '62.5x9']);
    expect(heaviest).toMatchObject({ totalKg: 65, reps: 5 });
    expect(bests.some((b) => b.setId === heaviest.setId)).toBe(true);
    expect(currentRecords([...sets].reverse())).toEqual(currentRecords(sets));
  });
});

describe('QA lb breakdown adds up to the total it shows', () => {
  const bars = [0, 7.5, 10, 15, 20, 20.41, 25];
  it('plates + bar equal the total, in lb, for every total in 0.25 kg steps', () => {
    const bad: string[] = [];
    for (const bar of bars)
      for (let q = Math.round(bar * 4); q <= 2000; q += 1) {
        const totalKg = q / 4;
        const side = perSideShown({ totalKg, barKg: bar, perSideKg: null }, 'lb');
        const { lines, total } = breakdownFor({ totalKg, barKg: bar, perSideKg: null }, 'lb');
        const sum = lines.reduce((acc, l) => acc + Number.parseFloat(l.value), 0);
        const plates = side === null ? null : side * 2;
        if (Math.abs(sum - Number.parseFloat(total)) > 0.005 && side !== null)
          bad.push(`${totalKg}/${bar}: ${lines.map((l) => l.value)} vs ${total} (${plates})`);
      }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('never says "NaN", "undefined" or "-" in any summary for stored totals from the 20 kg bar up to 500 kg', () => {
    for (let h = 2000; h <= 50_000; h += 37)
      for (const unit of ['kg', 'lb'] as const) {
        const { headline, detail } = setSummary(
          { totalKg: h / 100, barKg: 20, perSideKg: null, reps: 8 },
          unit,
        );
        expect(`${headline} ${detail ?? ''}`).not.toMatch(/NaN|undefined|-\d|Infinity/);
      }
  });
});
