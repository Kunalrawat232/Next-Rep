// QA pass: the History section of the exercise picker, and the hook that feeds it.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../../domain/exercises';
import seed from '../../domain/exercises.seed.json';
import { HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';
import { ExercisePicker } from './ExercisePicker';

const make = (name: string, over: Partial<Exercise> = {}): Exercise => ({
  id: name,
  name,
  equipmentType: 'barbell',
  bodyPart: 'upper',
  muscle: 'chest',
  aliases: [],
  tier: 'curated',
  ...over,
});
const names = (count: number) => Array.from({ length: count }, (_, i) => `Lift ${i + 1}`);

function pickerWith(history: string[], extra: Exercise[] = [], onSelect?: () => void) {
  const exercises = [...history.map((n) => make(n)), ...extra, make('Zottman Curl')];
  const entries = history.map((name) => ({
    exercise: exercises.find((e) => e.name === name)!,
    last: new Date().toISOString(),
  }));
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <ExercisePicker
        exercises={exercises}
        customProblem={null}
        onRetryCustom={() => undefined}
        history={entries}
        onSelect={onSelect}
      />
    </MemoryRouter>,
  );
  return { user };
}

const section = () => screen.queryByRole('region', { name: 'History' });
const rows = () => within(section()!).getAllByRole('listitem');

describe('History section size', () => {
  it.each([
    [1, 1, false],
    [5, 5, false],
    [6, 6, false], // exactly 6: nothing is hidden, so no button
    [7, 6, true], // 7: one hidden
    [12, 6, true],
  ])('with %i entries shows %i and %s a Show all button', (count, shown, button) => {
    pickerWith(names(count));
    expect(rows()).toHaveLength(shown);
    const toggle = within(section()!).queryByRole('button', { name: /^Show (all|fewer)/ });
    expect(Boolean(toggle)).toBe(button);
    if (button) expect(toggle).toHaveTextContent(`Show all ${count}`);
  });

  it('Show all then Show fewer goes 6, 7, 6, and keeps the order', async () => {
    const { user } = pickerWith(names(7));
    await user.click(within(section()!).getByRole('button', { name: 'Show all 7' }));
    expect(rows()).toHaveLength(7);
    expect(rows().map((r) => r.textContent)).toEqual(
      names(7).map((n) => expect.stringContaining(n)),
    );
    await user.click(within(section()!).getByRole('button', { name: 'Show fewer' }));
    expect(rows()).toHaveLength(6);
    expect(within(section()!).getByRole('button', { name: 'Show all 7' })).toBeInTheDocument();
  });

  it('is not there with an empty history', () => {
    pickerWith([]);
    expect(section()).toBeNull();
  });
});

describe('History while searching and filtering', () => {
  it('goes away while a search is typed or an equipment chip is on, and comes back after clearing', async () => {
    const { user } = pickerWith(names(7));
    expect(section()).not.toBeNull();

    await user.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'lift');
    expect(section()).toBeNull();
    expect(screen.queryByText('Show all 7')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(section()).not.toBeNull();

    await user.click(
      within(screen.getByRole('group', { name: 'Equipment' })).getByRole('button', {
        name: 'Dumbbell',
      }),
    );
    expect(section()).toBeNull();
    await user.click(
      within(screen.getByRole('group', { name: 'Equipment' })).getByRole('button', { name: 'All' }),
    );
    expect(section()).not.toBeNull();
  });

  it('a search of only spaces is still browsing, so History stays', async () => {
    const { user } = pickerWith(names(2));
    await user.type(screen.getByRole('searchbox', { name: 'Search exercises' }), '   ');
    expect(section()).not.toBeNull();
  });

  it('keeps Show all expanded when a search is typed and cleared again (no surprise collapse)', async () => {
    const { user } = pickerWith(names(8));
    await user.click(within(section()!).getByRole('button', { name: 'Show all 8' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(rows()).toHaveLength(8);
  });
});

describe('History rows', () => {
  it('a row picks the exercise when the picker has onSelect, with its own name and not the one under it', async () => {
    const onSelect = vi.fn();
    const { user } = pickerWith(['Lift A', 'Lift B'], [], onSelect);
    await user.click(within(section()!).getByRole('button', { name: /^Lift B/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ name: 'Lift B' });
  });

  it('shows a custom exercise in History with when it was last done', () => {
    const mine = make('My cable thing', { tier: 'custom', equipmentType: 'cable' });
    pickerWith(['Lift A'], [mine]);
    const done = [...rows()].map((r) => r.textContent);
    expect(done[0]).toContain('Lift A');
    expect(done[0]).toContain('Last done Today');
  });

  it('names an exercise with a long name without dropping the note', () => {
    const long = 'Single arm incline dumbbell press on a stability ball with a pause at the bottom';
    pickerWith([long]);
    expect(rows()[0]).toHaveTextContent(long);
    expect(rows()[0]).toHaveTextContent(/Last done/);
  });
});

const ids = seed.slice(0, 8);

/** Sets on the device for the given exercise ids, one workout each, oldest first, then the Exercises screen. */
async function openAfterLogging(
  list: { exerciseId: string; at: Date }[],
  customExercises: Exercise[] = [],
) {
  const userId = `histqa-${Math.random()}`;
  const first = renderApp('/', { userId, server: offlineServer(), customExercises });
  for (const { exerciseId, at } of list) {
    const workout = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: at.toISOString(),
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: HOME_GYM.bars },
    });
    await first.store.logSet(
      aSet(workout.id, {
        exerciseId,
        totalKg: 40,
        barKg: null,
        perSideKg: null,
        inputMode: 'total',
        reps: 8,
        loggedAt: new Date(at.getTime() + 60_000).toISOString(),
      }),
    );
    await first.store.endWorkout(workout.id, new Date(at.getTime() + 3_600_000).toISOString());
  }
  first.unmount();
  return renderApp('/exercises', { userId, server: offlineServer(), customExercises });
}

describe('History from the sets on the device', () => {
  it('leaves out an exercise that is no longer in the library, and does not crash', async () => {
    const gone = '99999999-9999-4999-8999-999999999999';
    await openAfterLogging([
      { exerciseId: ids[0]!.id, at: new Date(2026, 9, 10, 9) },
      { exerciseId: gone, at: new Date(2026, 9, 11, 9) },
    ]);
    const history = await screen.findByRole('region', { name: 'History' });
    const items = within(history).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(ids[0]!.name);
  });

  it('shows no History at all when every logged exercise is gone from the library', async () => {
    await openAfterLogging([
      { exerciseId: '99999999-9999-4999-8999-999999999999', at: new Date(2026, 9, 11, 9) },
    ]);
    await screen.findByRole('searchbox', { name: 'Search exercises' });
    await screen.findByRole('heading', { name: 'Popular exercises' });
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument();
  });

  it('lists a custom exercise that has sets, by its own name', async () => {
    const mine: Exercise = {
      id: '11111111-2222-4333-8444-555555555555',
      name: 'Rehab band pull',
      equipmentType: 'cable',
      bodyPart: 'upper',
      muscle: null,
      aliases: [],
      tier: 'custom',
    };
    await openAfterLogging(
      [
        { exerciseId: ids[0]!.id, at: new Date(2026, 9, 10, 9) },
        { exerciseId: mine.id, at: new Date(2026, 9, 12, 9) },
      ],
      [mine],
    );
    const history = await screen.findByRole('region', { name: 'History' });
    const items = within(history).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Rehab band pull');
    expect(items[1]).toHaveTextContent(ids[0]!.name);
  });

  it('lists an exercise once however many sets it has, at its latest time', async () => {
    await openAfterLogging([
      { exerciseId: ids[0]!.id, at: new Date(2026, 9, 10, 9) },
      { exerciseId: ids[1]!.id, at: new Date(2026, 9, 11, 9) },
      { exerciseId: ids[0]!.id, at: new Date(2026, 9, 12, 9) },
      { exerciseId: ids[0]!.id, at: new Date(2026, 9, 13, 9) },
    ]);
    const history = await screen.findByRole('region', { name: 'History' });
    const items = within(history).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining(ids[0]!.name),
      expect.stringContaining(ids[1]!.name),
    ]);
  });

  it('puts two exercises done at the very same time in a steady order across a reload', async () => {
    const at = new Date(2026, 9, 10, 9);
    const first = await openAfterLogging([
      { exerciseId: ids[2]!.id, at },
      { exerciseId: ids[3]!.id, at },
    ]);
    const history = await screen.findByRole('region', { name: 'History' });
    const before = within(history)
      .getAllByRole('listitem')
      .map((i) => i.textContent);
    first.unmount();
    renderApp('/exercises', { userId: first.userId, server: offlineServer() });
    const again = await screen.findByRole('region', { name: 'History' });
    await waitFor(() =>
      expect(
        within(again)
          .getAllByRole('listitem')
          .map((i) => i.textContent),
      ).toEqual(before),
    );
  });
});
