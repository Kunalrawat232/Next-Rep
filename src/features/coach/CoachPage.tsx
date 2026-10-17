import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Button,
  Card,
  Chip,
  ErrorMessage,
  LoadingMessage,
  Skeleton,
  Switch,
} from '../../components';
import { COACH_QUESTION_MAX } from '../../domain/coach';
import { useOnline } from '../../lib/useOnline';
import { useSettled } from '../../lib/useSettled';
import { CoachText } from './CoachText';
import { useCoachChat } from './useCoachChat';

const STARTERS = [
  'How do I break a bench press plateau?',
  'Should I deload this week?',
  'How much rest between heavy sets?',
  'How do I use my suggested weight?',
];

const NOTICE_KEY = 'next-rep-coach-notice';

function noticeSeen(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === 'seen';
  } catch {
    return false;
  }
}

/** Ask the AI coach a training question. Text only; the coach never changes anything in the app. */
export function CoachPage() {
  const chat = useCoachChat();
  const online = useOnline();
  const settled = useSettled(chat.state.status === 'ready');
  const [draft, setDraft] = useState('');
  const [share, setShare] = useState(true);
  const [seen, setSeen] = useState(noticeSeen);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = chat.state.status === 'ready' ? chat.state.messages.length : 0;

  // Keeps the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [count, chat.sending]);

  if (!settled || chat.state.status !== 'ready')
    return <LoadingMessage>Loading the coach…</LoadingMessage>;
  const { messages } = chat.state;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft;
    if (text.trim() === '' || chat.sending || !online) return;
    setDraft('');
    // A question the coach could not answer comes back into the box, to edit and send again.
    if ((await chat.send(text, share)) === 'failed') setDraft((now) => (now === '' ? text : now));
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit();
  }

  function dismissNotice() {
    try {
      window.localStorage.setItem(NOTICE_KEY, 'seen');
    } catch {
      // Without storage the notice shows again next time, which is harmless.
    }
    setSeen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-title font-semibold">Coach</h1>
        {messages.length > 0 &&
          (confirmingClear ? (
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={async () => {
                  await chat.clear();
                  setConfirmingClear(false);
                }}
              >
                Clear it
              </Button>
              <Button variant="secondary" onClick={() => setConfirmingClear(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmingClear(true)}>
              Clear chat
            </Button>
          ))}
      </header>

      {!seen && (
        <Card role="note" tone="accent" className="flex flex-col gap-3">
          <p className="text-callout">
            The coach is an AI that gives training tips, not medical advice. Your question, and a
            short summary of your recent workouts if you leave that on, go to Google&apos;s free AI
            service, which may use it to improve its products. Your chat stays on this device.
          </p>
          <Button variant="secondary" className="self-start" onClick={dismissNotice}>
            Got it
          </Button>
        </Card>
      )}

      {messages.length === 0 && !chat.sending ? (
        <section aria-label="Ideas" className="flex flex-col gap-3">
          <p className="text-callout text-ink-muted">
            Ask about technique, progress, rest or recovery. For example:
          </p>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((starter) => (
              <Chip key={starter} selected={false} onClick={() => setDraft(starter)}>
                {starter}
              </Chip>
            ))}
          </div>
        </section>
      ) : (
        <ol
          aria-label="Chat with the coach"
          aria-live="polite"
          aria-relevant="additions"
          className="flex flex-col gap-3"
        >
          {messages.map((message) =>
            message.role === 'user' ? (
              <li
                key={message.id}
                className="self-end rounded-md bg-accent px-4 py-3 text-on-accent max-w-[85%]"
              >
                <span className="sr-only">You: </span>
                <p className="whitespace-pre-wrap">{message.text}</p>
              </li>
            ) : (
              <li
                key={message.id}
                className="max-w-[92%] self-start rounded-md border border-glass-line glass-flat px-4 py-3"
              >
                <span className="sr-only">Coach: </span>
                <CoachText text={message.text} />
              </li>
            ),
          )}
          {chat.sending && (
            <li
              role="status"
              aria-label="The coach is thinking"
              className="loader-in flex w-48 flex-col gap-2 self-start rounded-md border border-glass-line glass-flat px-4 py-3"
            >
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </li>
          )}
        </ol>
      )}
      <div ref={end} />

      {chat.problem && <ErrorMessage>{chat.problem}</ErrorMessage>}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="coach-question" className="text-callout font-medium">
          Ask the coach
        </label>
        <textarea
          id="coach-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKey}
          maxLength={COACH_QUESTION_MAX}
          rows={3}
          disabled={!online}
          placeholder={
            online
              ? 'For example: how many sets of squats should I do?'
              : 'The coach needs an internet connection.'
          }
          className="min-h-touch w-full resize-none rounded-sm border border-glass-line bg-surface-300 px-4 py-3 text-body text-ink disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-callout font-medium">Use my last 3 workouts</span>
            <span className="text-caption text-ink-muted">
              Names and numbers only, no account details
            </span>
          </div>
          <Switch label="Use my last 3 workouts" checked={share} onChange={setShare} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-caption text-ink-muted">
            {draft.length}/{COACH_QUESTION_MAX}
          </span>
          <Button type="submit" disabled={!online || chat.sending || draft.trim() === ''}>
            {chat.sending ? 'Thinking…' : 'Ask'}
          </Button>
        </div>
        {!online && (
          <p role="status" className="text-callout text-ink-muted">
            You're offline. The coach needs an internet connection; everything else still works.
          </p>
        )}
      </form>
    </div>
  );
}
