// The history pull does not bring an empty workout from the server onto the device.
import { describe, expect, it } from 'vitest';
import { aSet, aWorkout, freshLocal } from '../../test/localDb';

const noGym = { gym: null };

function pulled(workouts: ReturnType<typeof aWorkout>[], sets: ReturnType<typeof aSet>[]) {
  const fullWorkouts = workouts.map((w) => ({
    ...w,
    endedAt: '2026-10-10T11:00:00.000Z',
    notes: null,
  }));
  return {
    workouts: fullWorkouts,
    sets,
    serverWorkoutIds: new Set(fullWorkouts.map((w) => w.id)),
    serverSetIds: new Set(sets.map((s) => s.id)),
    ...noGym,
  };
}

describe('mergePulled and empty workouts', () => {
  it('stores a workout that has sets and skips one that has none', async () => {
    const { store } = freshLocal();
    const full = aWorkout({ startedAt: '2026-10-10T08:00:00.000Z' });
    const empty = aWorkout({ startedAt: '2026-10-10T09:00:00.000Z' });
    const outcome = await store.mergePulled(pulled([full, empty], [aSet(full.id)]));
    expect(outcome.addedWorkouts).toBe(1);
    expect(await store.getWorkout(full.id)).toBeDefined();
    expect(await store.getWorkout(empty.id)).toBeUndefined();
  });

  it('stores nothing when every pulled workout is empty', async () => {
    const { store } = freshLocal();
    const outcome = await store.mergePulled(pulled([aWorkout(), aWorkout()], []));
    expect(outcome.addedWorkouts).toBe(0);
    expect(await store.endedWorkouts(10)).toEqual([]);
  });

  it('keeps a workout that is already on the device, whatever the server says about its sets', async () => {
    const { store } = freshLocal();
    const w = aWorkout();
    await store.mergePulled(pulled([w], [aSet(w.id)]));
    const again = await store.mergePulled(pulled([w], [aSet(w.id)]));
    expect(again.addedWorkouts).toBe(0);
    expect(await store.getWorkout(w.id)).toBeDefined();
  });
});
