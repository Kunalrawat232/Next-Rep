import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, Card, Switch, TextField } from '../../components';
import { useLiquidGlass } from '../../lib/useGlassEffect';
import {
  REST_EXTEND,
  REST_MAX,
  REST_MIN_CUSTOM,
  REST_PRESETS,
  formatRest,
  parseCustomRest,
} from '../../domain/rest';
import type { RestTimer as Timer } from './useRestTimer';

/** The rest pill on the workout screen, and the panel to start, extend or stop a rest. */
export function RestTimer({ timer }: { timer: Timer }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  useLiquidGlass(pillRef, 'round');

  const label =
    timer.remaining === null
      ? 'Rest'
      : timer.over
        ? 'Rest over'
        : `Rest ${formatRest(timer.remaining)}`;

  function close() {
    setCustom('');
    setProblem(null);
    setOpen(false);
    pillRef.current?.focus();
  }

  function begin(seconds: number) {
    timer.start(seconds);
    close();
  }

  function escape(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) close();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = parseCustomRest(custom);
    if (result.ok) begin(result.seconds);
    else setProblem(result.message);
  }

  return (
    <div
      className="pointer-events-none sticky top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex flex-col gap-3"
      onKeyDown={escape}
    >
      <button
        ref={pillRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={`pointer-events-auto glass inline-flex min-h-touch items-center gap-2 self-start rounded-full border px-4 text-callout font-medium tabular-nums ${
          timer.over ? 'border-warning text-warning' : 'border-glass-line'
        }`}
      >
        {label}
      </button>
      <span role="status" className="sr-only">
        {timer.over ? 'Rest over' : ''}
      </span>
      {open && (
        <Card
          id={panelId}
          role="group"
          aria-label="Rest timer"
          className="pointer-events-auto flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-2">
            {REST_PRESETS.map((seconds) => (
              <Button key={seconds} variant="secondary" onClick={() => begin(seconds)}>
                {seconds} s
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-callout font-medium">Start after each set</span>
              <span className="text-caption text-ink-muted">
                {formatRest(timer.seconds)}, or the last length you picked
              </span>
            </div>
            <Switch label="Start after each set" checked={timer.auto} onChange={timer.setAuto} />
          </div>
          <form onSubmit={submit} noValidate className="flex flex-col gap-2">
            <TextField
              label="Custom rest (seconds)"
              hint={`${REST_MIN_CUSTOM} to ${REST_MAX} seconds`}
              error={problem ?? undefined}
              inputMode="numeric"
              value={custom}
              onChange={(event) => {
                setCustom(event.target.value);
                setProblem(null);
              }}
            />
            <Button type="submit" variant="secondary">
              Start custom rest
            </Button>
          </form>
          {timer.remaining !== null && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={timer.extend}>
                +{REST_EXTEND} s
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  timer.stop();
                  close();
                }}
              >
                {timer.over ? 'Dismiss' : 'Stop rest'}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
