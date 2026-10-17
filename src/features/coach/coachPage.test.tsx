import type { Table } from 'dexie';
import { COACH_NAME } from '../../domain/coach';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoachRequest } from '../../domain/coach';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { tapTogether } from '../../test/doubleTap';
import { aSet, aWorkout } from '../../test/localDb';
import type { CoachAnswer, CoachService } from './coachService';

/** A coach that answers from a list, and remembers what it was asked. */
function fakeCoach(...answers: CoachAnswer[]) {
  const asked: CoachRequest[] = [];
  let i = 0;
  const service: CoachService = {
    ask: vi.fn<CoachService['ask']>(async (request: CoachRequest) => {
      asked.push(request);
      return answers[Math.min(i++, answers.length - 1)] ?? { status: 'ok', text: 'Add 2.5 kg.' };
    }),
  };
  return { service, asked };
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const box = () => screen.findByRole('textbox', { name: `Message ${COACH_NAME}` });
const askButton = () => screen.getByRole('button', { name: 'Send' });

describe('the Coach screen', () => {
  it('gives the coach a name and a person for a picture', async () => {
    renderApp('/coach', { coach: fakeCoach().service });
    expect(await screen.findByRole('heading', { level: 1, name: COACH_NAME })).toBeInTheDocument();
    expect(screen.getByText('Your Personal Trainer')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coach' })).not.toBeInTheDocument();
  });

  it('has the send button and the character count inside the text box', async () => {
    const { user } = renderApp('/coach', { coach: fakeCoach().service });
    const field = await box();
    await user.type(field, 'abc');
    const frame = field.parentElement!;
    expect(within(frame).getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(within(frame).getByText('3/500')).toBeInTheDocument();
    // There is no separate "Ask" button any more.
    expect(screen.queryByRole('button', { name: 'Ask' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ask')).not.toBeInTheDocument();
  });

  it('introduces itself by name in what it says: its messages, the typing label and the screen reader prefix', async () => {
    const coach = fakeCoach({ status: 'ok', text: 'Add 2.5 kg.' });
    const { user } = renderApp('/coach', { coach: coach.service });
    await user.type(await box(), 'hi');
    await user.click(askButton());
    const chat = await screen.findByRole('list', { name: 'Chat with the coach' });
    const reply = (await within(chat).findByText('Add 2.5 kg.')).closest('li')!;
    expect(reply).toHaveTextContent(`${COACH_NAME}: `);
  });

  it('starts with ideas, and tapping one puts it in the box without sending it', async () => {
    const coach = fakeCoach();
    const { user } = renderApp('/coach', { coach: coach.service });
    await user.click(await screen.findByRole('button', { name: /break a bench press plateau/i }));
    expect(await box()).toHaveValue('How do I break a bench press plateau?');
    expect(coach.service.ask).not.toHaveBeenCalled();
  });

  it('sends a question, shows the reply, and keeps both on the device', async () => {
    const coach = fakeCoach({ status: 'ok', text: 'Add 2.5 kg and keep the reps.' });
    const { user, store } = renderApp('/coach', { coach: coach.service });
    await user.type(await box(), 'Should I add weight?');
    await user.click(askButton());
    const chat = await screen.findByRole('list', { name: 'Chat with the coach' });
    expect(await within(chat).findByText('Add 2.5 kg and keep the reps.')).toBeInTheDocument();
    expect(within(chat).getByText('Should I add weight?')).toBeInTheDocument();
    expect(await box()).toHaveValue('');
    expect((await store.coachMessages()).map((m) => [m.role, m.text])).toEqual([
      ['user', 'Should I add weight?'],
      ['coach', 'Add 2.5 kg and keep the reps.'],
    ]);
  });

  it('sends the earlier turns with the next question', async () => {
    const coach = fakeCoach(
      { status: 'ok', text: 'First answer.' },
      { status: 'ok', text: 'Second answer.' },
    );
    const { user } = renderApp('/coach', { coach: coach.service });
    await user.type(await box(), 'one');
    await user.click(askButton());
    await screen.findByText('First answer.');
    await user.type(await box(), 'two');
    await user.click(askButton());
    await screen.findByText('Second answer.');
    expect(coach.asked[1]).toMatchObject({
      question: 'two',
      history: [
        { role: 'user', text: 'one' },
        { role: 'coach', text: 'First answer.' },
      ],
    });
  });

  it('starts with sharing off, and says so on the switch', async () => {
    renderApp('/coach', { coach: fakeCoach().service });
    expect(await screen.findByRole('switch', { name: 'Use my last 3 workouts' })).not.toBeChecked();
  });

  it('sends a summary of the last workouts, with no ids and no account details', async () => {
    const userId = `coach-${Math.random()}`;
    const seed = renderApp('/', { userId, server: offlineServer() });
    const workout = await seed.store.startWorkout({
      ...aWorkout(),
      startedAt: '2026-10-10T10:00:00.000Z',
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: [] },
    });
    await seed.store.logSet(
      aSet(workout.id, { exerciseId: BENCH, totalKg: 62.5, barKg: 15, perSideKg: 23.75, reps: 6 }),
    );
    await seed.store.endWorkout(workout.id, '2026-10-10T11:00:00.000Z');
    seed.unmount();

    const coach = fakeCoach();
    const { user } = renderApp('/coach', { userId, coach: coach.service, server: offlineServer() });
    await user.click(await screen.findByRole('switch', { name: 'Use my last 3 workouts' }));
    await user.type(await box(), 'How am I doing?');
    await user.click(askButton());
    await waitFor(() => expect(coach.asked).toHaveLength(1));
    const [request] = coach.asked;
    expect(request!.context?.unit).toBe('kg');
    expect(request!.context?.sessions[0]?.exercises[0]).toEqual({
      name: 'Barbell Bench Press',
      sets: 1,
      topWeight: 62.5,
      topReps: 6,
    });
    const sent = JSON.stringify(request);
    expect(sent).not.toContain(BENCH);
    expect(sent).not.toContain(userId);
    expect(sent).not.toContain('ada@example.com');
  });

  it('does not send the name of an exercise the person made up, which can say something private', async () => {
    const userId = `coach-${Math.random()}`;
    const mine = '11111111-2222-4333-8444-555555555555';
    const customExercises = [
      {
        id: mine,
        name: 'rehab left knee',
        equipmentType: 'cable' as const,
        bodyPart: 'lower' as const,
        muscle: null,
        aliases: [],
        tier: 'custom' as const,
      },
    ];
    const seed = renderApp('/', { userId, server: offlineServer(), customExercises });
    const workout = await seed.store.startWorkout({
      ...aWorkout(),
      startedAt: '2026-10-10T10:00:00.000Z',
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: [] },
    });
    await seed.store.logSet(
      aSet(workout.id, {
        exerciseId: mine,
        totalKg: 20,
        barKg: null,
        perSideKg: null,
        inputMode: 'total',
        reps: 10,
      }),
    );
    await seed.store.endWorkout(workout.id, '2026-10-10T11:00:00.000Z');
    seed.unmount();

    const coach = fakeCoach();
    const { user } = renderApp('/coach', {
      userId,
      coach: coach.service,
      server: offlineServer(),
      customExercises,
    });
    await user.click(await screen.findByRole('switch', { name: 'Use my last 3 workouts' }));
    await user.type(await box(), 'How am I doing?');
    await user.click(askButton());
    await waitFor(() => expect(coach.asked).toHaveLength(1));
    const sent = JSON.stringify(coach.asked[0]);
    expect(sent).toContain('Custom exercise');
    expect(sent).not.toContain('rehab');
  });

  it('sends no summary unless the switch is turned on', async () => {
    const coach = fakeCoach();
    const { user } = renderApp('/coach', { coach: coach.service });
    await user.type(await box(), 'General question');
    await user.click(askButton());
    await waitFor(() => expect(coach.asked).toHaveLength(1));
    expect(coach.asked[0]).not.toHaveProperty('context');
  });

  it.each([
    ['offline', /you're offline/i],
    ['limited', new RegExp(`asked ${COACH_NAME} a lot`, 'i')],
    ['unavailable', /can't answer right now/i],
  ] as const)(
    'says so when the coach is %s, keeps nothing, and gives the question back',
    async (status, words) => {
      const coach = fakeCoach({ status });
      const { user, store } = renderApp('/coach', { coach: coach.service });
      await user.type(await box(), 'My question');
      await user.click(askButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(words);
      expect(await box()).toHaveValue('My question');
      expect(await store.coachMessages()).toEqual([]);
    },
  );

  it('answers a question that is not about the gym or diet with the fixed refusal, and keeps both', async () => {
    const coach = fakeCoach({ status: 'off_topic' });
    const { user, store } = renderApp('/coach', { coach: coach.service });
    await user.type(await box(), 'What is the weather today?');
    await user.click(askButton());
    const chat = await screen.findByRole('list', { name: 'Chat with the coach' });
    expect(await within(chat).findByText(/I can't answer this question/i)).toBeInTheDocument();
    expect(within(chat).getByText('What is the weather today?')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await box()).toHaveValue('');
    expect((await store.coachMessages()).map((m) => m.role)).toEqual(['user', 'coach']);
  });

  it('sends once when Ask is tapped twice at once', async () => {
    const coach = fakeCoach();
    const { user } = renderApp('/coach', { coach: coach.service });
    await user.type(await box(), 'Double tap');
    tapTogether(askButton());
    await screen.findByText('Add 2.5 kg.');
    expect(coach.service.ask).toHaveBeenCalledTimes(1);
  });

  it('shows that the coach is thinking while it waits, and blocks a second question', async () => {
    let finish: (answer: CoachAnswer) => void = () => undefined;
    const service: CoachService = { ask: () => new Promise((resolve) => (finish = resolve)) };
    const { user } = renderApp('/coach', { coach: service });
    await user.type(await box(), 'Slow one');
    await user.click(askButton());
    const typing = await screen.findByRole('status', { name: `${COACH_NAME} is typing` });
    // Three bouncing dots in the coach's bubble, like a chat app, not a skeleton.
    expect(within(typing).getAllByTestId('typing-dot')).toHaveLength(3);
    expect(typing.querySelector('.skeleton')).toBeNull();
    expect(typing).not.toHaveClass('loader-in');
    expect(askButton()).toBeDisabled();
    expect(askButton()).toHaveAttribute('aria-busy', 'true');
    act(() => finish({ status: 'ok', text: 'Done.' }));
    expect(await screen.findByText('Done.')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: `${COACH_NAME} is typing` }),
    ).not.toBeInTheDocument();
  });

  it("puts the coach's picture beside its messages and squares off the bubble corners nearest the speaker", async () => {
    const { user } = renderApp('/coach', { coach: fakeCoach().service });
    await user.type(await box(), 'Hello');
    await user.click(askButton());
    const chat = await screen.findByRole('list', { name: 'Chat with the coach' });
    const reply = (await within(chat).findByText('Add 2.5 kg.')).closest('li')!;
    expect(reply.querySelector('svg')).not.toBeNull();
    expect(reply.querySelector('.rounded-bl-md')).not.toBeNull();
    expect(within(chat).getByText('Hello').closest('li')).toHaveClass('rounded-br-md');
  });

  it('sends with Enter, and Shift+Enter makes a new line instead', async () => {
    const coach = fakeCoach();
    const { user } = renderApp('/coach', { coach: coach.service });
    const field = await box();
    await user.type(field, 'first line{Shift>}{Enter}{/Shift}second line');
    expect(coach.service.ask).not.toHaveBeenCalled();
    expect(field).toHaveValue('first line\nsecond line');
    await user.keyboard('{Enter}');
    await screen.findByText('Add 2.5 kg.');
    expect(coach.service.ask).toHaveBeenCalledTimes(1);
    expect(coach.asked[0]!.question).toBe('first line\nsecond line');
    expect(field).toHaveValue('');
  });

  it('does not send when Enter only confirms a word in an input method', async () => {
    const coach = fakeCoach();
    const { user } = renderApp('/coach', { coach: coach.service });
    const field = await box();
    await user.type(field, 'namaste');
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    expect(coach.service.ask).not.toHaveBeenCalled();
  });

  it('does not send on Enter when the box is empty', async () => {
    const coach = fakeCoach();
    const { user } = renderApp('/coach', { coach: coach.service });
    await user.type(await box(), '   {Enter}');
    expect(coach.service.ask).not.toHaveBeenCalled();
  });

  it('does not send an empty question', async () => {
    const coach = fakeCoach();
    const { user } = renderApp('/coach', { coach: coach.service });
    await user.type(await box(), '   ');
    expect(askButton()).toBeDisabled();
    expect(coach.service.ask).not.toHaveBeenCalled();
  });

  it('limits a question to 500 characters and counts them', async () => {
    const { user } = renderApp('/coach', { coach: fakeCoach().service });
    const field = await box();
    expect(field).toHaveAttribute('maxlength', '500');
    await user.type(field, 'abc');
    expect(screen.getByText('3/500')).toBeInTheDocument();
  });

  it('cannot be used offline, and says why, but the page still opens', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderApp('/coach', { coach: fakeCoach().service });
    expect(await box()).toBeDisabled();
    expect(askButton()).toBeDisabled();
    expect(screen.getAllByText(/needs an internet connection/i).length).toBeGreaterThan(0);
  });

  it('shows what the coach said as text, never as markup', async () => {
    const evil = '<img src=x onerror=alert(1)> and <a href="https://evil.example">link</a>';
    const coach = fakeCoach({ status: 'ok', text: evil });
    const { user } = renderApp('/coach', { coach: coach.service });
    await user.type(await box(), 'Hi');
    await user.click(askButton());
    const chat = await screen.findByRole('list', { name: 'Chat with the coach' });
    await within(chat).findByText(evil);
    expect(chat.querySelector('img, a')).toBeNull();
  });

  it('keeps the chat after a reload of the app', async () => {
    const userId = `coach-${Math.random()}`;
    const first = renderApp('/coach', { userId, coach: fakeCoach().service });
    await first.user.type(await box(), 'Remember me');
    await first.user.click(askButton());
    await screen.findByText('Add 2.5 kg.');
    first.unmount();
    renderApp('/coach', { userId, coach: fakeCoach().service });
    expect(await screen.findByText('Remember me')).toBeInTheDocument();
    expect(screen.getByText('Add 2.5 kg.')).toBeInTheDocument();
  });

  it('clears the chat only after a confirmation', async () => {
    const { user, store } = renderApp('/coach', { coach: fakeCoach().service });
    await user.type(await box(), 'Something');
    await user.click(askButton());
    await screen.findByText('Add 2.5 kg.');
    await user.click(screen.getByRole('button', { name: 'Clear chat' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(await store.coachMessages()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Clear chat' }));
    await user.click(screen.getByRole('button', { name: 'Clear it' }));
    await waitFor(async () => expect(await store.coachMessages()).toEqual([]));
    expect(await screen.findByRole('region', { name: 'Ideas' })).toBeInTheDocument();
  });

  it('tells a new user once that it is an AI, for training tips, sent to Google, and stays dismissed', async () => {
    const first = renderApp('/coach', { coach: fakeCoach().service });
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent(/not medical advice/i);
    expect(note).toHaveTextContent(/google/i);
    expect(note).toHaveTextContent(/stays on this device/i);
    await first.user.click(within(note).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    first.unmount();
    renderApp('/coach', { coach: fakeCoach().service });
    await box();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is reached from the tab bar', async () => {
    const { router, user } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'AI Coach' }));
    expect(router.state.location.pathname).toBe('/coach');
  });

  it('says it is unavailable when no coach is set up', async () => {
    const { user } = renderApp('/coach');
    await user.type(await box(), 'Anyone there?');
    await user.click(askButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/can't answer right now/i);
  });
});

/** The shared methods of Dexie tables: the app opens its own copy of the database, so they are patched here. */
const tableProto = (db: { coachMessages: Table<unknown, string> }) => {
  let proto: object | null = Object.getPrototypeOf(db.coachMessages);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'put'))
    proto = Object.getPrototypeOf(proto);
  return proto as Table<unknown, string>;
};

describe('the chat while a question is out, and when the device store fails', () => {
  /** A coach whose answer is held until the test lets it go. */
  function heldCoach() {
    let release: (answer: CoachAnswer) => void = () => undefined;
    const service: CoachService = {
      ask: vi.fn<CoachService['ask']>(
        () =>
          new Promise<CoachAnswer>((resolve) => {
            release = resolve;
          }),
      ),
    };
    return { service, release: (answer: CoachAnswer) => release(answer) };
  }

  it('cannot be cleared while a question is out, so the answer never brings an old chat back', async () => {
    const held = heldCoach();
    const { user } = renderApp('/coach', { coach: held.service });
    await user.type(await box(), 'First question');
    await user.click(askButton());
    const clear = await screen.findByRole('button', { name: 'Clear chat' });
    expect(clear).toBeDisabled();
    act(() => held.release({ status: 'ok', text: 'The answer' }));
    await screen.findByText('The answer');
    expect(screen.getByText('First question')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Clear chat' })).toBeEnabled();
  });

  it('takes the question back out of the chat and gives it back when the answer cannot be kept', async () => {
    const { user, store, db } = renderApp('/coach', { coach: fakeCoach().service });
    const put = tableProto(db).put;
    let calls = 0;
    vi.spyOn(tableProto(db), 'put').mockImplementation(function (this: Table, ...args) {
      if (this.name !== 'coachMessages') return put.apply(this, args);
      calls += 1;
      if (calls === 2)
        return Promise.reject(new Error('quota')) as unknown as ReturnType<typeof put>;
      return put.apply(this, args);
    });
    await user.type(await box(), 'Will this be kept?');
    await user.click(askButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/can't answer right now/i);
    expect(screen.queryByRole('list', { name: 'Chat with the coach' })).not.toBeInTheDocument();
    expect(await box()).toHaveValue('Will this be kept?');
    expect(await store.coachMessages()).toHaveLength(0);
  });

  it('clears once when tapped twice at the same instant', async () => {
    const { user, db } = renderApp('/coach', { coach: fakeCoach().service });
    await user.type(await box(), 'Hello');
    await user.click(askButton());
    await screen.findByText('Add 2.5 kg.');
    const clear = tableProto(db).clear;
    let cleared = 0;
    vi.spyOn(tableProto(db), 'clear').mockImplementation(function (this: Table) {
      if (this.name === 'coachMessages') cleared += 1;
      return clear.call(this);
    });
    await user.click(await screen.findByRole('button', { name: 'Clear chat' }));
    await tapTogether(await screen.findByRole('button', { name: 'Clear it' }));
    await waitFor(() => expect(cleared).toBe(1));
  });

  it('says so when the chat cannot be cleared, and keeps it', async () => {
    const { user, db } = renderApp('/coach', { coach: fakeCoach().service });
    await user.type(await box(), 'Hello');
    await user.click(askButton());
    await screen.findByText('Add 2.5 kg.');
    vi.spyOn(tableProto(db), 'clear').mockRejectedValue(new Error('closed'));
    await user.click(await screen.findByRole('button', { name: 'Clear chat' }));
    await user.click(await screen.findByRole('button', { name: 'Clear it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not clear the chat/i);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
