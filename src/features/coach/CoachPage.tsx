import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, Card, Chip, ErrorMessage, LoadingMessage, Switch } from '../../components';
import { COACH_NAME, COACH_QUESTION_MAX } from '../../domain/coach';
import { useOnline } from '../../lib/useOnline';
import { usePending } from '../../lib/usePending';
import { useSettled } from '../../lib/useSettled';
import { CoachAvatar, CoachBubble, TypingBubble } from './ChatParts';
import { CoachText } from './CoachText';
import { useCoachChat } from './useCoachChat';

const STARTERS = [
  'How do I break a bench press plateau?',
  'Should I deload this week?',
  'How much rest between heavy sets?',
  'How do I use my suggested weight?',
  'What should I eat before a workout?',
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
  const [share, setShare] = useState(false);
  const [seen, setSeen] = useState(noticeSeen);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  const clearing = usePending();
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const count = chat.state.status === 'ready' ? chat.state.messages.length : 0;

  // The box grows with what is typed, up to about five lines, and shrinks when it is sent.
  useEffect(() => {
    const box = field.current;
    if (!box) return;
    box.style.height = 'auto';
    if (box.scrollHeight > 0) box.style.height = `${box.scrollHeight}px`;
  }, [draft]);

  // Keeps the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [count, chat.sending]);

  if (!settled || chat.state.status !== 'ready')
    return <LoadingMessage>Loading {COACH_NAME}…</LoadingMessage>;
  const { messages } = chat.state;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft;
    if (text.trim() === '' || chat.sending || !online) return;
    setDraft('');
    // A question the coach could not answer comes back into the box, to edit and send again.
    if ((await chat.send(text, share)) === 'failed') setDraft((now) => (now === '' ? text : now));
  }

  // Enter sends, as in a chat app; Shift+Enter makes a new line. Enter that confirms a word in an input method does not send.
  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
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
        <div className="flex items-center gap-3">
          <CoachAvatar size={44} />
          <div className="flex flex-col">
            <h1 className="text-title font-semibold">{COACH_NAME}</h1>
            <span className="text-caption text-ink-muted">Your Personal Trainer</span>
          </div>
        </div>
        {messages.length > 0 &&
          (confirmingClear ? (
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={chat.sending || clearing.pending}
                onClick={async () => {
                  if (!clearing.begin()) return;
                  try {
                    await chat.clear();
                    setClearFailed(false);
                    setConfirmingClear(false);
                  } catch {
                    setClearFailed(true);
                  } finally {
                    clearing.end();
                  }
                }}
              >
                Clear it
              </Button>
              <Button variant="secondary" onClick={() => setConfirmingClear(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              disabled={chat.sending}
              onClick={() => {
                setClearFailed(false);
                setConfirmingClear(true);
              }}
            >
              Clear chat
            </Button>
          ))}
      </header>

      {!seen && (
        <Card role="note" tone="accent" className="flex flex-col gap-3">
          <p className="text-callout">
            {COACH_NAME} is an AI coach that gives training tips, not medical advice. Your question,
            and a short summary of your recent workouts if you turn that on, go to Google&apos;s
            free AI service, which may use it to improve its products. Your chat stays on this
            device.
          </p>
          <Button variant="secondary" className="self-start" onClick={dismissNotice}>
            Got it
          </Button>
        </Card>
      )}

      {messages.length === 0 && !chat.sending ? (
        <section aria-label="Ideas" className="flex flex-col gap-3">
          <p className="text-callout text-ink-muted">
            Ask {COACH_NAME} about gym and diet: technique, workouts, progress, recovery or what to
            eat. {COACH_NAME} can't help with anything else. For example:
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
                className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-accent px-4 py-3 text-on-accent"
              >
                <span className="sr-only">You: </span>
                <p className="whitespace-pre-wrap">{message.text}</p>
              </li>
            ) : (
              <li key={message.id} className="flex max-w-[92%] items-end gap-2 self-start">
                <CoachBubble>
                  <span className="sr-only">{COACH_NAME}: </span>
                  <CoachText text={message.text} />
                </CoachBubble>
              </li>
            ),
          )}
          {chat.sending && <TypingBubble />}
        </ol>
      )}
      <div ref={end} />

      {clearFailed && <ErrorMessage>Could not clear the chat. Try again.</ErrorMessage>}
      {chat.problem && <ErrorMessage>{chat.problem}</ErrorMessage>}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="relative rounded-3xl border border-glass-line glass-flat focus-within:outline focus-within:outline-2 focus-within:outline-accent">
          <label htmlFor="coach-question" className="sr-only">
            Message {COACH_NAME}
          </label>
          <textarea
            id="coach-question"
            ref={field}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKey}
            maxLength={COACH_QUESTION_MAX}
            rows={1}
            disabled={!online}
            placeholder={
              online ? `Message ${COACH_NAME}…` : `${COACH_NAME} needs an internet connection.`
            }
            className="block max-h-40 min-h-12 w-full resize-none bg-transparent px-4 pb-9 pr-16 pt-3 text-body text-ink placeholder:text-ink-muted focus-visible:outline-none disabled:opacity-60"
          />
          <span className="pointer-events-none absolute bottom-3 left-4 text-[10px] leading-none text-ink-muted">
            {draft.length}/{COACH_QUESTION_MAX}
          </span>
          <button
            type="submit"
            aria-label="Send"
            aria-busy={chat.sending}
            disabled={!online || chat.sending || draft.trim() === ''}
            className="absolute bottom-2 right-2 flex size-12 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-callout font-medium">Use my last 3 workouts</span>
            <span className="text-caption text-ink-muted">
              Names and numbers only, no account details
            </span>
          </div>
          <Switch label="Use my last 3 workouts" checked={share} onChange={setShare} />
        </div>
        {!online && (
          <p role="status" className="text-callout text-ink-muted">
            You're offline. {COACH_NAME} needs an internet connection; everything else still works.
          </p>
        )}
      </form>
    </div>
  );
}
