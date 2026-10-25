import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aWorkout } from '../../test/localDb';
import type { TranscribeService } from '../voice';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };

/** The browser recogniser of an iPhone: it listens, hears nothing and ends without an error. */
class DeafMic {
  static all: DeafMic[] = [];
  constructor() {
    DeafMic.all.push(this);
  }
  onresult = null;
  onerror = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (type: string) => type === 'audio/mp4';
  state = 'inactive';
  mimeType = 'audio/mp4';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(3000)]) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('webkitSpeechRecognition', DeafMic);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'mediaDevices');
  FakeMediaRecorder.instances = [];
  DeafMic.all = [];
  localStorage.clear();
});

async function openWorkout(transcribe: TranscribeService) {
  const userId = `cloud-${Math.random()}`;
  const first = renderApp('/workout', { userId, server: offlineServer() });
  const workout = await first.store.startWorkout({
    ...aWorkout(),
    startedAt: '2026-10-01T10:00:00.000Z',
    gymId: HOME_GYM.id,
    gymSnapshot: HOME,
  });
  first.unmount();
  const app = renderApp(`/workout?exercise=${BENCH}`, {
    userId,
    server: offlineServer(),
    transcribe,
  });
  return { ...app, workout };
}

describe('voice logging through the cloud recogniser', () => {
  it('switches over after the phone cannot hear, then logs what the service heard, after a tap on Log set', async () => {
    const transcribe = {
      transcribe: vi.fn(async () => ({ ok: true as const, text: 'bench press 60 kilo 8 reps' })),
    };
    const app = await openWorkout(transcribe);

    await app.user.click(await screen.findByRole('button', { name: /tap to speak a set/i }));
    act(() => DeafMic.all.at(-1)?.onend?.());
    expect(await screen.findByText(/voice now uses the internet/i)).toBeInTheDocument();

    await app.user.click(screen.getByRole('button', { name: /tap to speak a set/i }));
    const stop = await screen.findByRole('button', { name: /listening… tap to stop/i });
    expect(screen.getByText(/sent to a speech service to turn it into text/i)).toBeInTheDocument();
    await app.user.click(stop);

    const card = await screen.findByRole('group', { name: /confirm/i }, { timeout: 5000 });
    expect(within(card).getByText(/heard: “bench press 60 kilo 8 reps”/i)).toBeInTheDocument();
    expect(transcribe.transcribe).toHaveBeenCalledTimes(1);
    const clip = transcribe.transcribe.mock.calls[0] as unknown as [Blob];
    expect(clip[0].type).toBe('audio/mp4');
    expect(await app.store.listSets(app.workout.id)).toHaveLength(0);

    await app.user.click(within(card).getByRole('button', { name: /log set/i }));
    await waitFor(async () => expect(await app.store.listSets(app.workout.id)).toHaveLength(1));
  });

  it('says so, and keeps tap logging, when the service has no answer', async () => {
    localStorage.setItem('next-rep-voice-mode', 'cloud');
    const app = await openWorkout({
      transcribe: async () => ({ ok: false, kind: 'unavailable', reason: 'http-503' }),
    });
    await app.user.click(await screen.findByRole('button', { name: /tap to speak a set/i }));
    await app.user.click(await screen.findByRole('button', { name: /listening… tap to stop/i }));
    expect(
      await screen.findByText(/voice is not available right now.*\(http-503\)/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tap to speak a set/i })).toBeEnabled();
  });
});
