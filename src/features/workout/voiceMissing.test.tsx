import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';
import type { ParseService } from '../voice';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };

class FakeMic {
  static all: FakeMic[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
  constructor() {
    FakeMic.all.push(this);
  }
  hear(text: string) {
    act(() => {
      this.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: text }], { isFinal: true })],
      });
      this.onend?.();
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  FakeMic.all = [];
});

async function openWorkout(options: { withSet?: boolean; parse?: ParseService } = {}) {
  vi.stubGlobal('webkitSpeechRecognition', FakeMic);
  const userId = `missing-${Math.random()}`;
  const first = renderApp('/workout', { userId, server: offlineServer() });
  const workout = await first.store.startWorkout({
    ...aWorkout(),
    startedAt: '2026-10-01T10:00:00.000Z',
    gymId: HOME_GYM.id,
    gymSnapshot: HOME,
  });
  if (options.withSet)
    await first.store.logSet(
      aSet(workout.id, {
        exerciseId: BENCH,
        totalKg: 60,
        barKg: 15,
        perSideKg: 22.5,
        reps: 8,
        loggedAt: '2026-10-10T10:00:00.000Z',
      }),
    );
  first.unmount();
  const app = renderApp(`/workout?exercise=${BENCH}`, {
    userId,
    server: offlineServer(),
    parse: options.parse,
  });
  const speak = async (text: string) => {
    await app.user.click(await screen.findByRole('button', { name: /tap to speak a set/i }));
    FakeMic.all.at(-1)?.hear(text);
  };
  return { ...app, workout, speak };
}

const asked = () => screen.findByRole('group', { name: 'Missing number' });

describe('a spoken set with a number missing', () => {
  it('asks for the reps, keeping the exercise and weight, and does not ask Gemini', async () => {
    const parse = { parse: vi.fn(async () => null) };
    const { speak, store, workout } = await openWorkout({ parse });
    await speak('bench press 45 kilo');
    const card = await asked();
    expect(within(card).getByText(/heard: “bench press 45 kilo”/i)).toBeInTheDocument();
    expect(within(card).getByText(/bench press · 45 kg/i)).toBeInTheDocument();
    expect(within(card).getByText('How many reps?')).toBeInTheDocument();
    expect(parse.parse).not.toHaveBeenCalled();
    expect(await store.listSets(workout.id)).toHaveLength(0);
  });

  it('turns a tapped rep count into the usual confirm card, and stores nothing until Log set', async () => {
    const { speak, user, store, workout } = await openWorkout();
    await speak('bench press 45 kilo');
    await user.click(within(await asked()).getByRole('button', { name: '8' }));
    const confirm = await screen.findByRole('group', { name: 'Confirm voice set' });
    expect(within(confirm).getByText(/bench press · 8 reps/i)).toBeInTheDocument();
    expect(within(confirm).getByRole('region', { name: 'Weight breakdown' })).toHaveTextContent(
      '45',
    );
    expect(screen.queryByRole('group', { name: 'Missing number' })).not.toBeInTheDocument();
    expect(await store.listSets(workout.id)).toHaveLength(0);

    await user.click(within(confirm).getByRole('button', { name: 'Log set' }));
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(1));
    expect((await store.listSets(workout.id))[0]).toMatchObject({
      exerciseId: BENCH,
      totalKg: 45,
      reps: 8,
      source: 'voice',
      rawTranscript: 'bench press 45 kilo',
    });
  });

  it('takes typed reps, and refuses a number that is not whole or out of range', async () => {
    const { speak, user } = await openWorkout();
    await speak('bench press 45 kilo');
    const card = await asked();
    const field = within(card).getByRole('textbox', { name: 'Reps' });
    const use = within(card).getByRole('button', { name: 'Use' });
    expect(use).toBeDisabled();
    for (const bad of ['0', '101', '7.5', 'abc']) {
      await user.clear(field);
      await user.type(field, bad);
      expect(use, bad).toBeDisabled();
      expect(
        within(card).getByText(/reps must be a whole number from 1 to 100/i),
      ).toBeInTheDocument();
    }
    await user.clear(field);
    await user.type(field, '12');
    expect(use).toBeEnabled();
    await user.click(use);
    const confirm = await screen.findByRole('group', { name: 'Confirm voice set' });
    expect(within(confirm).getByText(/bench press · 12 reps/i)).toBeInTheDocument();
  });

  it('asks for the weight when only the reps were said, and offers the last weight', async () => {
    const { speak, user, store, workout } = await openWorkout({ withSet: true });
    await speak('bench press 8 reps');
    const card = await asked();
    expect(within(card).getByText(/bench press · 8 reps/i)).toBeInTheDocument();
    expect(within(card).getByText('How much weight?')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /same as last time \(60 kg\)/i }));
    const confirm = await screen.findByRole('group', { name: 'Confirm voice set' });
    expect(within(confirm).getByRole('region', { name: 'Weight breakdown' })).toHaveTextContent(
      '60',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Log set' }));
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(2));
  });

  it('takes a typed weight, and offers no last weight when there is none', async () => {
    const { speak, user } = await openWorkout();
    await speak('bench press 8 reps');
    const card = await asked();
    expect(
      within(card).queryByRole('button', { name: /same as last time/i }),
    ).not.toBeInTheDocument();
    const use = within(card).getByRole('button', { name: 'Use' });
    await user.type(within(card).getByRole('textbox', { name: /weight/i }), 'heavy');
    expect(use).toBeDisabled();
    await user.clear(within(card).getByRole('textbox', { name: /weight/i }));
    await user.type(within(card).getByRole('textbox', { name: /weight/i }), '62.5');
    await user.click(use);
    const confirm = await screen.findByRole('group', { name: 'Confirm voice set' });
    expect(within(confirm).getByRole('region', { name: 'Weight breakdown' })).toHaveTextContent(
      '62.5',
    );
  });

  it('puts nothing in the log when cancelled, and a new spoken set replaces the question', async () => {
    const { speak, user, store, workout } = await openWorkout();
    await speak('bench press 45 kilo');
    await user.click(within(await asked()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Missing number' })).not.toBeInTheDocument();
    expect(await store.listSets(workout.id)).toHaveLength(0);

    await speak('bench press 45 kilo');
    await asked();
    await speak('bench press 50 kilo 6 reps');
    await screen.findByRole('group', { name: 'Confirm voice set' });
    expect(screen.queryByRole('group', { name: 'Missing number' })).not.toBeInTheDocument();
  });

  it('still says it did not understand when both numbers are missing', async () => {
    const { speak } = await openWorkout();
    await speak('bench press');
    expect(
      await screen.findByText(/not understood|how many reps|which exercise|how much/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Missing number' })).not.toBeInTheDocument();
  });
});
