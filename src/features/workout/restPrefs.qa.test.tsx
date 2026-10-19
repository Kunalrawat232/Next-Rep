// QA pass: the saved rest preferences (length and "start after each set") when storage is damaged, odd, blocked or shared.
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };
const prefsKey = (userId: string) => `next-rep-rest-prefs-${userId}`;

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

/** An open workout on the device for a user, with their saved prefs (raw text) put in storage first. */
async function openAs(userId: string, rawPrefs: string | null, path = '/workout') {
  const seed = renderApp('/workout', { userId, server: offlineServer() });
  await seed.store.startWorkout({ ...aWorkout(), gymId: HOME_GYM.id, gymSnapshot: HOME });
  seed.unmount();
  if (rawPrefs !== null) localStorage.setItem(prefsKey(userId), rawPrefs);
  const app = renderApp(path, { userId, server: offlineServer() });
  return { ...app, userId };
}

const freshUser = () => `restprefs-${Math.random()}`;

async function openPanel(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('button', { name: /^Rest/ }));
  const panel = screen.getByRole('group', { name: 'Rest timer' });
  return {
    panel,
    auto: within(panel).getByRole('switch', { name: 'Start after each set' }),
    caption: () => within(panel).getByText(/or the last length you picked/).textContent,
  };
}

describe('saved rest preferences are read safely', () => {
  it.each([
    ['nothing saved', null, true, '1:30'],
    ['not JSON', 'not json', true, '1:30'],
    ['an empty string', '', true, '1:30'],
    ['null', 'null', true, '1:30'],
    ['an array', '[]', true, '1:30'],
    ['seconds as text', '{"seconds":"60","auto":true}', true, '1:30'],
    ['a fractional length', '{"seconds":90.5,"auto":true}', true, '1:30'],
    ['29 s, just under the minimum', '{"seconds":29,"auto":true}', true, '1:30'],
    ['901 s, just over the maximum', '{"seconds":901,"auto":true}', true, '1:30'],
    ['0 s', '{"seconds":0,"auto":true}', true, '1:30'],
    ['a negative length', '{"seconds":-60,"auto":true}', true, '1:30'],
    ['auto as the text "false"', '{"seconds":60,"auto":"false"}', true, '1:30'],
    ['auto missing', '{"seconds":60}', true, '1:30'],
    ['seconds missing', '{"auto":false}', true, '1:30'],
    ['30 s, the minimum', '{"seconds":30,"auto":true}', true, '0:30'],
    ['900 s, the maximum', '{"seconds":900,"auto":true}', true, '15:00'],
    ['auto off with 45 s', '{"seconds":45,"auto":false}', false, '0:45'],
    ['an extra field', '{"seconds":60,"auto":true,"extra":1}', true, '1:00'],
  ])('%s', async (_name, raw, autoOn, caption) => {
    const { user } = await openAs(freshUser(), raw);
    const { auto, caption: shown } = await openPanel(user);
    expect(auto).toHaveAttribute('aria-checked', String(autoOn));
    expect(shown()).toContain(caption);
  });

  it('keeps the saved length when only the switch is turned off, and writes valid JSON', async () => {
    const { user, userId } = await openAs(freshUser(), '{"seconds":45,"auto":true}');
    const { auto } = await openPanel(user);
    await user.click(auto);
    expect(JSON.parse(localStorage.getItem(prefsKey(userId))!)).toEqual({
      seconds: 45,
      auto: false,
    });
  });

  it('replaces damaged text with valid prefs the first time something is saved', async () => {
    const { user, userId } = await openAs(freshUser(), '{{{ broken');
    const { auto } = await openPanel(user);
    await user.click(auto);
    expect(JSON.parse(localStorage.getItem(prefsKey(userId))!)).toEqual({
      seconds: 90,
      auto: false,
    });
  });

  it('a custom rest outside 30 to 900 never reaches the saved length', async () => {
    const { user, userId } = await openAs(freshUser(), null);
    const { panel } = await openPanel(user);
    await user.type(within(panel).getByRole('textbox', { name: /custom rest/i }), '20');
    await user.click(within(panel).getByRole('button', { name: 'Start custom rest' }));
    expect(localStorage.getItem(prefsKey(userId))).toBeNull();
  });
});

describe('two people on one device', () => {
  it('prefs saved by one are not used by the other', async () => {
    const a = await openAs(freshUser(), '{"seconds":45,"auto":false}');
    const first = await openPanel(a.user);
    expect(first.auto).toHaveAttribute('aria-checked', 'false');
    a.unmount();

    const b = await openAs(freshUser(), null);
    const second = await openPanel(b.user);
    expect(second.auto).toHaveAttribute('aria-checked', 'true');
    expect(second.caption()).toContain('1:30');
    // And A is still as they left it.
    b.unmount();
    const again = renderApp('/workout', { userId: a.userId, server: offlineServer() });
    const panelAgain = await openPanel(again.user);
    expect(panelAgain.auto).toHaveAttribute('aria-checked', 'false');
  });
});

describe('storage that is blocked', () => {
  it('opens the panel and switches in this visit when storage throws on read and write', async () => {
    const { user } = await openAs(freshUser(), null);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { auto } = await openPanel(user);
    expect(auto).toHaveAttribute('aria-checked', 'true');
    await user.click(auto);
    expect(
      within(screen.getByRole('group', { name: 'Rest timer' })).getByRole('switch', {
        name: 'Start after each set',
      }),
    ).toHaveAttribute('aria-checked', 'false');
    // A preset still starts a rest.
    await user.click(screen.getByRole('button', { name: '60 s' }));
    expect(
      await screen.findByRole('button', { name: /^Rest 1:0\d$|^Rest 0:59$/ }),
    ).toBeInTheDocument();
  });
});

async function tapLog(app: Awaited<ReturnType<typeof openAs>>) {
  const weight = await screen.findByRole('textbox', { name: /^weight/i });
  await app.user.clear(weight);
  await app.user.type(weight, '20');
  await app.user.clear(screen.getByRole('textbox', { name: 'Reps' }));
  await app.user.type(screen.getByRole('textbox', { name: 'Reps' }), '8');
  await app.user.click(screen.getByRole('button', { name: 'Log set' }));
  await waitFor(() => expect(app.router.state.location.pathname).toBe('/workout'));
}

describe('a rest after a set uses the saved prefs', () => {
  it.each([
    ['the saved length', '{"seconds":45,"auto":true}', /^Rest 0:4[45]$/],
    ['the default for damaged prefs', 'garbage', /^Rest 1:(30|29)$/],
    [
      'the default when the length is out of range',
      '{"seconds":5,"auto":true}',
      /^Rest 1:(30|29)$/,
    ],
  ])('tap logging starts %s', async (_name, raw, label) => {
    const app = await openAs(freshUser(), raw, `/workout/log?exercise=${BENCH}`);
    await tapLog(app);
    expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
  });

  it('tap logging starts nothing when auto is off', async () => {
    const app = await openAs(
      freshUser(),
      '{"seconds":45,"auto":false}',
      `/workout/log?exercise=${BENCH}`,
    );
    await tapLog(app);
    expect(await screen.findByRole('button', { name: 'Rest' })).toBeInTheDocument();
  });

  it('a length picked by hand while saved prefs say 45 s becomes the length after the next set', async () => {
    const app = await openAs(freshUser(), '{"seconds":45,"auto":true}');
    const { panel } = await openPanel(app.user);
    await app.user.click(within(panel).getByRole('button', { name: '180 s' }));
    // 180 s was picked by hand, so it is also the length that starts next time.
    await app.user.click(await screen.findByRole('link', { name: 'Choose exercise' }));
    await app.user.type(
      await screen.findByRole('searchbox', { name: 'Search exercises' }),
      'barbell bench press',
    );
    await app.user.click(await screen.findByRole('button', { name: /^Barbell Bench Press/ }));
    await app.user.click(await screen.findByRole('link', { name: 'Tap instead' }));
    await tapLog(app);
    expect(await screen.findByRole('button', { name: /^Rest (3:00|2:59)$/ })).toBeInTheDocument();
  });

  it('voice logging starts nothing when auto is off, and uses the saved length when on', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeMic);
    const off = await openAs(
      freshUser(),
      '{"seconds":45,"auto":false}',
      `/workout?exercise=${BENCH}`,
    );
    await off.user.click(await screen.findByRole('button', { name: /tap to speak a set/i }));
    FakeMic.all.at(-1)!.hear('bench press 60 kilo 8 reps');
    await off.user.click(await screen.findByRole('button', { name: 'Log set' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Confirm voice set' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Rest' })).toBeInTheDocument();
    off.unmount();

    const on = await openAs(
      freshUser(),
      '{"seconds":45,"auto":true}',
      `/workout?exercise=${BENCH}`,
    );
    await on.user.click(await screen.findByRole('button', { name: /tap to speak a set/i }));
    FakeMic.all.at(-1)!.hear('bench press 60 kilo 8 reps');
    await on.user.click(await screen.findByRole('button', { name: 'Log set' }));
    expect(await screen.findByRole('button', { name: /^Rest 0:4[45]$/ })).toBeInTheDocument();
  });

  it('a refused voice set (out of range) starts no rest', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeMic);
    const app = await openAs(freshUser(), null, `/workout?exercise=${BENCH}`);
    await app.user.click(await screen.findByRole('button', { name: /tap to speak a set/i }));
    FakeMic.all.at(-1)!.hear('bench press 900 kilo 8 reps');
    await screen.findByRole('group', { name: 'Confirm voice set' });
    expect(screen.getByRole('button', { name: 'Log set' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rest' })).toBeInTheDocument();
  });
});
