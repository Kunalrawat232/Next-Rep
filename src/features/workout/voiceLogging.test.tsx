import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { tapTogether } from '../../test/doubleTap';
import { aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { name: 'Home gym', barbellKg: 15, bars: HOME_GYM.bars };

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
  /** What the person says, then the browser stops listening. */
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

async function openWorkout(options: { mic?: boolean } = {}) {
  if (options.mic !== false) vi.stubGlobal('webkitSpeechRecognition', FakeMic);
  const userId = `voice-${Math.random()}`;
  const first = renderApp('/workout', { userId, server: offlineServer() });
  const workout = await first.store.startWorkout({
    ...aWorkout(),
    startedAt: '2026-10-01T10:00:00.000Z',
    gymId: HOME_GYM.id,
    gymSnapshot: HOME,
  });
  first.unmount();
  const app = renderApp(`/workout?exercise=${BENCH}`, { userId, server: offlineServer() });
  const speak = async (text: string) => {
    await app.user.click(await screen.findByRole('button', { name: /tap to speak a set/i }));
    FakeMic.all.at(-1)?.hear(text);
  };
  return { ...app, workout, speak };
}

describe('voice logging on the workout page', () => {
  it('shows what was heard with the breakdown, and stores nothing until Log set', async () => {
    const { speak, store, workout } = await openWorkout();
    await speak('bench press 60 kilo 8 reps');
    const card = await screen.findByRole('group', { name: 'Confirm voice set' });
    expect(within(card).getByText(/heard: “bench press 60 kilo 8 reps”/i)).toBeInTheDocument();
    expect(within(card).getByText(/bench press · 8 reps/i)).toBeInTheDocument();
    expect(within(card).getByRole('region', { name: 'Weight breakdown' })).toHaveTextContent('60');
    expect(await store.listSets(workout.id)).toHaveLength(0);
  });

  it('logs the set as a voice set with the transcript', async () => {
    const { speak, user, store, workout } = await openWorkout();
    await speak('bench press 60 kilo 8 reps');
    await user.click(await screen.findByRole('button', { name: 'Log set' }));
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(1));
    const [set] = await store.listSets(workout.id);
    expect(set).toMatchObject({
      exerciseId: BENCH,
      totalKg: 60,
      reps: 8,
      source: 'voice',
      rawTranscript: 'bench press 60 kilo 8 reps',
      inputMode: 'total',
    });
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Confirm voice set' })).not.toBeInTheDocument(),
    );
  });

  it('lets the user flip a weight with no "per side" word to per side before logging', async () => {
    const { speak, user, store, workout } = await openWorkout();
    await speak('bench press 20 kilo 8 reps');
    await user.click(await screen.findByRole('button', { name: 'Per side' }));
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(1));
    expect((await store.listSets(workout.id))[0]).toMatchObject({
      totalKg: 55,
      perSideKg: 20,
      inputMode: 'per_side',
    });
  });

  it('reads "each side" from the phrase', async () => {
    const { speak, user, store, workout } = await openWorkout();
    await speak('bench press 20 kilo each side 8 reps');
    expect(await screen.findByRole('button', { name: 'Per side' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(1));
    expect((await store.listSets(workout.id))[0]?.totalKg).toBe(55);
  });

  it('asks before logging a weight below the bar', async () => {
    const { speak, user, store, workout } = await openWorkout();
    await speak('bench press 10 kilo 8 reps');
    await user.click(await screen.findByRole('button', { name: 'Log set' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await store.listSets(workout.id)).toHaveLength(0);
  });

  it('Cancel stores nothing', async () => {
    const { speak, user, store, workout } = await openWorkout();
    await speak('bench press 60 kilo 8 reps');
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Confirm voice set' })).not.toBeInTheDocument();
    expect(await store.listSets(workout.id)).toHaveLength(0);
  });

  it('stores one set when Log set is tapped twice at once', async () => {
    const { speak, store, workout } = await openWorkout();
    await speak('bench press 60 kilo 8 reps');
    const button = await screen.findByRole('button', { name: 'Log set' });
    tapTogether(button);
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(1));
  });

  it('says so when it did not understand, and stores nothing', async () => {
    const { speak, store, workout } = await openWorkout();
    await speak('blah blah');
    expect(await screen.findByText(/was not understood/i)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Confirm voice set' })).not.toBeInTheDocument();
    expect(await store.listSets(workout.id)).toHaveLength(0);
  });

  it('starts the rest timer by voice', async () => {
    const { speak } = await openWorkout();
    await speak('rest 90 seconds');
    expect(await screen.findByText(/rest started: 1:30/i)).toBeInTheDocument();
  });

  it('refuses a rest outside the allowed range', async () => {
    const { speak } = await openWorkout();
    await speak('rest 10 seconds');
    expect(await screen.findByText(/rest can be/i)).toBeInTheDocument();
  });

  it('explains a blocked microphone', async () => {
    const { user } = await openWorkout();
    await user.click(await screen.findByRole('button', { name: /tap to speak a set/i }));
    act(() => {
      FakeMic.all[0]?.onerror?.({ error: 'not-allowed' });
      FakeMic.all[0]?.onend?.();
    });
    expect(await screen.findByText(/microphone is blocked/i)).toBeInTheDocument();
  });

  it('disables the mic offline and keeps tap logging', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await openWorkout();
    expect(await screen.findByRole('button', { name: /tap to speak a set/i })).toBeDisabled();
    expect(screen.getAllByText(/voice needs internet/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Tap instead' })).toBeInTheDocument();
  });

  it('hides the mic where the browser cannot listen', async () => {
    await openWorkout({ mic: false });
    expect(await screen.findByText(/not supported in this browser/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tap to speak/i })).not.toBeInTheDocument();
  });
});
