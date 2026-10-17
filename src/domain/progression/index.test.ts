import { describe, expect, it } from 'vitest';
import { describeSuggestion, suggest, type Session, type SessionSet } from '.';
import type { BodyPart } from '../exercises';
import type { EquipmentType, Unit } from '../schemas';
import { fromDisplay, toDisplay } from '../units';

let minute = 0;
const set = (totalKg: number, reps: number, barKg: number | null = 20): SessionSet => ({
  totalKg,
  barKg,
  reps,
  loggedAt: new Date(Date.UTC(2026, 9, 1, 9, (minute += 1))).toISOString(),
});
const session = (...sets: SessionSet[]): Session => ({ sets });
/** n sets of the same weight and reps. */
const sets = (n: number, totalKg: number, reps: number, bar: number | null = 20) =>
  Array.from({ length: n }, () => set(totalKg, reps, bar));

const ask = (
  sessions: Session[],
  over: Partial<{ bodyPart: BodyPart; equipment: EquipmentType; unit: Unit }> = {},
) => suggest({ sessions, bodyPart: 'upper', equipment: 'barbell', unit: 'kg', ...over });

describe('after a session where every working set reached the target', () => {
  it('suggests 2.5 Kg more for upper body, with the same reps', () => {
    const r = ask([session(...sets(3, 60, 8))]);
    expect(r).toMatchObject({ kind: 'increase', totalKg: 62.5, reps: 8 });
    expect(r!.basis).toMatchObject({
      lastTotalKg: 60,
      workingSets: 3,
      targetReps: 8,
      hit: true,
      missedTwice: false,
    });
  });

  it('suggests 5 Kg more for lower body', () => {
    expect(ask([session(...sets(3, 100, 5))], { bodyPart: 'lower' })).toMatchObject({
      kind: 'increase',
      totalKg: 105,
    });
  });

  it('treats the core as upper body', () => {
    expect(ask([session(...sets(3, 40, 10))], { bodyPart: 'core' })).toMatchObject({
      totalKg: 42.5,
    });
  });

  it('counts only the sets at the top weight, so lighter back-off sets do not matter', () => {
    const r = ask([session(set(60, 8), set(60, 8), set(50, 12), set(50, 4))]);
    expect(r).toMatchObject({ kind: 'increase', totalKg: 62.5 });
    expect(r!.basis.workingSets).toBe(2);
  });

  it('takes more reps in later sets as fine', () => {
    expect(ask([session(set(60, 8), set(60, 9), set(60, 10))])).toMatchObject({ kind: 'increase' });
  });

  it('always adds weight after a single top set, since it cannot miss its own target', () => {
    expect(ask([session(set(100, 3))])).toMatchObject({ kind: 'increase', totalKg: 102.5 });
    expect(ask([session(set(100, 1))])).toMatchObject({ kind: 'increase' });
  });

  it('suggests a whole plate pair above a weight that was off the grid', () => {
    // 61 kg on a 20 kg bar: the grid is 60, 62.5, 65. 61 + 2.5 = 63.5, nearest is 62.5, above 61.
    expect(ask([session(...sets(3, 61, 8))])).toMatchObject({ kind: 'increase', totalKg: 62.5 });
    // Just below a grid point: the nearest point to the target would not be above, so the next one is.
    expect(ask([session(...sets(3, 62.4, 8))])).toMatchObject({ totalKg: 65 });
  });

  it('puts the plates on the bar that was used, not on multiples of the total', () => {
    // A 10.5 kg bar: loads are 10.5, 13, 15.5 ... 60.5 is the 20th. +2.5 = 63, which is on the grid.
    expect(ask([session(...sets(3, 60.5, 8, 10.5))])).toMatchObject({ totalKg: 63 });
    expect(ask([session(...sets(3, 63, 8, 10.5))])).toMatchObject({ totalKg: 65.5 });
  });

  it('uses steps of 2.5 from zero for equipment without a bar', () => {
    expect(ask([session(...sets(3, 22.5, 10, null))], { equipment: 'dumbbell' })).toMatchObject({
      totalKg: 25,
    });
    expect(ask([session(...sets(3, 21, 10, null))], { equipment: 'machine' })).toMatchObject({
      totalKg: 22.5,
    });
  });

  it('never goes past what can be logged, and says there is nowhere to go', () => {
    expect(ask([session(...sets(3, 500, 3))])).toMatchObject({ kind: 'same', totalKg: 500 });
    expect(ask([session(...sets(3, 497.5, 3))])).toMatchObject({ kind: 'increase', totalKg: 500 });
    expect(ask([session(...sets(3, 499, 3))])).toMatchObject({ kind: 'increase', totalKg: 500 });
    expect(describeSuggestion(ask([session(...sets(3, 500, 3))])!, 'kg')).toBe(
      'You hit 3 × 3 at 500 Kg last time, and that is as heavy as can be logged.',
    );
  });
});

describe('after a session where a working set fell short', () => {
  it('suggests the same weight, exactly', () => {
    const r = ask([session(set(60, 8), set(60, 8), set(60, 6))]);
    expect(r).toMatchObject({ kind: 'same', totalKg: 60, reps: 8 });
  });

  it('keeps an off-grid weight exactly as it was', () => {
    expect(ask([session(set(61.23, 8), set(61.23, 6))])).toMatchObject({
      kind: 'same',
      totalKg: 61.23,
    });
  });

  it('adds weight again after a miss followed by a good session', () => {
    expect(ask([session(set(60, 8), set(60, 5)), session(...sets(3, 60, 8))])).toMatchObject({
      kind: 'increase',
      totalKg: 62.5,
    });
  });

  it('stays the same after a good session followed by a miss', () => {
    expect(ask([session(...sets(3, 60, 8)), session(set(62.5, 8), set(62.5, 5))])).toMatchObject({
      kind: 'same',
      totalKg: 62.5,
    });
  });
});

describe('after falling short twice in a row at the same weight', () => {
  const miss = (kg: number) => session(set(kg, 8), set(kg, 8), set(kg, 5));

  it('suggests about 10% less, on a whole plate pair', () => {
    // 10% off 60 is 54; the loads are 20 + 2.5k, so 52.5.
    const r = ask([miss(60), miss(60)]);
    expect(r).toMatchObject({ kind: 'decrease', totalKg: 52.5, reps: 8 });
    expect(r!.basis.missedTwice).toBe(true);
  });

  it('only counts the weight of the last session: a lighter earlier one does not make two', () => {
    expect(ask([miss(57.5), miss(60)])).toMatchObject({ kind: 'same', totalKg: 60 });
  });

  it('compares weights in hundredths of a kg', () => {
    expect(ask([miss(61.23), miss(61.24)])).toMatchObject({ kind: 'same' });
    expect(ask([miss(61.23), miss(61.23)])).toMatchObject({ kind: 'decrease' });
  });

  it('never goes below the bar', () => {
    // 10% off 22.5 is 20.25, which is on a pair below 20: the empty bar is the floor.
    expect(ask([miss(22.5), miss(22.5)])).toMatchObject({ kind: 'decrease', totalKg: 20 });
    // At the bar already, there is nothing to take off.
    expect(ask([miss(20), miss(20)])).toMatchObject({ kind: 'same', totalKg: 20 });
  });

  it('never goes below zero without a bar', () => {
    const small = (kg: number) => session(set(kg, 10, null), set(kg, 5, null));
    expect(ask([small(2.5), small(2.5)], { equipment: 'dumbbell' })).toMatchObject({
      kind: 'same',
      totalKg: 2.5,
    });
  });

  it('ignores a session with no sets between them', () => {
    expect(ask([miss(60), session(), miss(60)])).toMatchObject({ kind: 'decrease' });
  });

  it('three misses in a row is still 10% less of the last weight', () => {
    expect(ask([miss(60), miss(60), miss(60)])).toMatchObject({ kind: 'decrease', totalKg: 52.5 });
  });
});

describe('when there is nothing to suggest', () => {
  it.each([
    ['no sessions', []],
    ['a session with no sets', [session()]],
    ['only empty sessions', [session(), session()]],
    ['a session at 0 Kg', [session(set(0, 10, null))]],
  ])('says nothing for %s', (_n, sessions) => {
    expect(ask(sessions, { equipment: 'dumbbell' })).toBeNull();
  });

  it('says nothing for bodyweight exercises', () => {
    expect(ask([session(...sets(3, 10, 12, null))], { equipment: 'bodyweight' })).toBeNull();
  });

  it('uses the latest session that has sets', () => {
    expect(ask([session(...sets(3, 60, 8)), session()])).toMatchObject({ totalKg: 62.5 });
  });
});

describe('in lb', () => {
  const BAR = fromDisplay(45, 'lb');
  const lbSets = (n: number, lb: number, reps: number, bar = BAR) =>
    sets(n, fromDisplay(lb, 'lb'), reps, bar);

  it.each([
    ['upper', 135, 140],
    ['upper', 185, 190],
    ['lower', 225, 235],
    ['lower', 315, 325],
  ] as const)('%s body at %s lb suggests %s lb', (bodyPart, from, to) => {
    const r = ask([session(...lbSets(3, from, 5))], { bodyPart, unit: 'lb' });
    expect(r!.kind).toBe('increase');
    expect(toDisplay(r!.totalKg, 'lb')).toBe(to);
  });

  it('puts the plates on a 35 Lb bar: the loads are 35, 40, 45 ...', () => {
    // 135 lb on a 35 lb bar: the grid is 35 + 5k, so 135 is on it, and 140 is next.
    const bar35 = fromDisplay(35, 'lb');
    const r = ask([session(...lbSets(3, 135, 8, bar35))], { unit: 'lb' });
    expect(toDisplay(r!.totalKg, 'lb')).toBe(140);
  });

  it('puts the plates on a 15 Kg bar shown as 33.1 Lb', () => {
    // The loads are 33.1, 38.1 ... 133.1, 138.1: 135 lb + 5 = 140, nearest is 138.1.
    const r = ask([session(...sets(3, fromDisplay(135, 'lb'), 8, 15))], { unit: 'lb' });
    expect(toDisplay(r!.totalKg, 'lb')).toBe(138.1);
  });

  it('keeps the exact stored weight for the same weight, whatever the unit', () => {
    const r = ask([session(set(60, 8), set(60, 5))], { unit: 'lb' });
    expect(r).toMatchObject({ kind: 'same', totalKg: 60 });
  });

  it('takes 10% off in lb, on a 5 Lb pair', () => {
    const miss = session(...lbSets(1, 225, 8), ...lbSets(1, 225, 5));
    const r = ask([miss, miss], { unit: 'lb' });
    // 10% off 225 is 202.5; the loads are 45 + 5k, so 200.
    expect(toDisplay(r!.totalKg, 'lb')).toBe(200);
  });

  it('shows the kg of every result as two decimals', () => {
    const r = ask([session(...lbSets(3, 135, 8))], { unit: 'lb' });
    expect(Math.round(r!.totalKg * 100) / 100).toBe(r!.totalKg);
  });
});

describe('the reason, in words', () => {
  it('says what was hit and how much more', () => {
    expect(describeSuggestion(ask([session(...sets(3, 60, 8))])!, 'kg')).toBe(
      'You hit 3 × 8 at 60 Kg last time, so try 2.5 Kg more.',
    );
  });

  it('says it in lb', () => {
    const r = ask([session(...sets(3, fromDisplay(135, 'lb'), 8, fromDisplay(45, 'lb')))], {
      unit: 'lb',
    });
    expect(describeSuggestion(r!, 'lb')).toBe(
      'You hit 3 × 8 at 135 Lb last time, so try 5 Lb more.',
    );
  });

  it('says why the weight stays', () => {
    expect(describeSuggestion(ask([session(set(60, 8), set(60, 5))])!, 'kg')).toBe(
      'You did not reach 8 reps on every set at 60 Kg last time, so stay at that weight.',
    );
  });

  it('says why the weight comes down', () => {
    const miss = session(set(60, 8), set(60, 5));
    expect(describeSuggestion(ask([miss, miss])!, 'kg')).toBe(
      'You did not reach 8 reps on every set at 60 Kg twice in a row, so try about 10% less.',
    );
  });
});
