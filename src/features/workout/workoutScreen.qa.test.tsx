// QA pass: the workout screen's way into the exercise picker, with and without an exercise, and no dead controls.
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };

async function openAt(path: string) {
  const userId = `wscreen-${Math.random()}`;
  const seed = renderApp('/workout', { userId, server: offlineServer() });
  await seed.store.startWorkout({ ...aWorkout(), gymId: HOME_GYM.id, gymSnapshot: HOME });
  seed.unmount();
  return renderApp(path, { userId, server: offlineServer() });
}

describe('with no exercise chosen', () => {
  it.each([
    ['no query', '/workout'],
    ['an empty exercise', '/workout?exercise='],
    ['an id that is not a UUID', '/workout?exercise=bench'],
    ['an SQL-looking id', "/workout?exercise=1'%20OR%20'1'='1"],
    ['a UUID-looking id with extra text', `/workout?exercise=${BENCH}-x`],
    ['an unrelated query', '/workout?foo=bar'],
  ])('%s: both ways in lead to the plain picker and nothing is dead', async (_name, path) => {
    await openAt(path);
    const header = await screen.findByRole('link', { name: 'Choose exercise' });
    expect(header).toHaveAttribute('href', '/workout/exercise');
    expect(screen.getByRole('link', { name: 'Pick an exercise' })).toHaveAttribute(
      'href',
      '/workout/exercise',
    );
    expect(screen.queryByRole('link', { name: 'Tap instead' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tap instead' })).not.toBeInTheDocument();
    // The only disabled button is Undo last, which has nothing to undo yet.
    const disabled = screen.getAllByRole('button').filter((b) => b.hasAttribute('disabled'));
    expect(disabled.map((b) => b.textContent)).toEqual(['Undo last']);
    // Every link goes somewhere.
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).toBeTruthy();
  });

  it('offers a way to tap-log only after an exercise is chosen', async () => {
    await openAt('/workout');
    await screen.findByRole('link', { name: 'Choose exercise' });
    expect(screen.queryByRole('link', { name: /log/i })).not.toBeInTheDocument();
  });
});

describe('with an exercise chosen', () => {
  it('names it in the header, keeps it when going to the picker, and offers Tap instead, not Pick an exercise', async () => {
    await openAt(`/workout?exercise=${BENCH}`);
    const header = await screen.findByRole('link', { name: 'Barbell Bench Press' });
    expect(header).toHaveAttribute('href', `/workout/exercise?exercise=${BENCH}`);
    expect(screen.getByRole('link', { name: 'Tap instead' })).toHaveAttribute(
      'href',
      `/workout/log?exercise=${BENCH}`,
    );
    expect(screen.queryByRole('link', { name: 'Pick an exercise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Choose exercise' })).not.toBeInTheDocument();
  });

  it('a valid id of an exercise that does not exist is named "Exercise", and still has a working header link', async () => {
    const unknown = '99999999-9999-4999-8999-999999999999';
    await openAt(`/workout?exercise=${unknown}`);
    const header = await screen.findByRole('link', { name: 'Exercise' });
    expect(header).toHaveAttribute('href', `/workout/exercise?exercise=${unknown}`);
  });

  it('shows no round Workout button on this screen', async () => {
    await openAt(`/workout?exercise=${BENCH}`);
    await screen.findByRole('link', { name: 'Barbell Bench Press' });
    expect(screen.getAllByRole('link', { name: 'Workout' })).toHaveLength(1);
  });
});
