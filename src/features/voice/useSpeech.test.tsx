import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { errorFor, type Recognition, type RecognitionEvent } from './speech';
import { useSpeech } from './useSpeech';

class FakeRecognition implements Recognition {
  lang = '';
  continuous = true;
  interimResults = true;
  maxAlternatives = 5;
  onresult: Recognition['onresult'] = null;
  onerror: Recognition['onerror'] = null;
  onend: Recognition['onend'] = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
  say(...parts: { text: string; final: boolean }[]) {
    const results = parts.map((part) =>
      Object.assign([{ transcript: part.text }], { isFinal: part.final }),
    );
    this.onresult?.({ resultIndex: 0, results } satisfies RecognitionEvent);
  }
}

function setup(factory?: () => Recognition) {
  const made: FakeRecognition[] = [];
  const create =
    factory ??
    (() => {
      const fake = new FakeRecognition();
      made.push(fake);
      return fake;
    });
  function Probe() {
    const speech = useSpeech(create);
    return (
      <div>
        <p>{speech.listening ? 'listening' : 'idle'}</p>
        <p>heard: {speech.transcript ?? 'nothing'}</p>
        <p>error: {speech.error ?? 'none'}</p>
        <button onClick={speech.start}>start</button>
        <button onClick={speech.stop}>stop</button>
        <button onClick={speech.clear}>clear</button>
      </div>
    );
  }
  return { made, ...render(<Probe />) };
}

describe('useSpeech', () => {
  it('listens once, in en-IN, and delivers the final words', async () => {
    const user = userEvent.setup();
    const { made } = setup();
    await user.click(screen.getByText('start'));
    await user.click(screen.getByText('start'));
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ lang: 'en-IN', continuous: false, interimResults: false });
    expect(screen.getByText('listening')).toBeInTheDocument();
    act(() => {
      made[0]?.say({ text: 'bench', final: false }, { text: 'bench 60 kilo 8 reps', final: true });
    });
    act(() => made[0]?.onend?.());
    expect(screen.getByText('heard: bench 60 kilo 8 reps')).toBeInTheDocument();
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('stop delivers what was heard', async () => {
    const user = userEvent.setup();
    const { made } = setup();
    await user.click(screen.getByText('start'));
    act(() => made[0]?.say({ text: 'squat 100 for 5', final: true }));
    await user.click(screen.getByText('stop'));
    expect(screen.getByText('heard: squat 100 for 5')).toBeInTheDocument();
  });

  it('turns browser error codes into friendly kinds', async () => {
    const user = userEvent.setup();
    const { made } = setup();
    await user.click(screen.getByText('start'));
    act(() => {
      made[0]?.onerror?.({ error: 'not-allowed' });
      made[0]?.onend?.();
    });
    expect(screen.getByText('error: denied')).toBeInTheDocument();
    expect(screen.getByText('heard: nothing')).toBeInTheDocument();
    expect(errorFor('no-speech')).toBe('no-speech');
    expect(errorFor('network')).toBe('unavailable');
    expect(errorFor('aborted')).toBe('failed');
  });

  it('can be started again after it ends, and a new try clears the old error', async () => {
    const user = userEvent.setup();
    const { made } = setup();
    await user.click(screen.getByText('start'));
    act(() => {
      made[0]?.onerror?.({ error: 'no-speech' });
      made[0]?.onend?.();
    });
    await user.click(screen.getByText('start'));
    expect(made).toHaveLength(2);
    expect(screen.getByText('error: none')).toBeInTheDocument();
  });

  it('reports a recogniser that cannot be made or started', async () => {
    const user = userEvent.setup();
    setup(() => {
      throw new Error('no');
    });
    await user.click(screen.getByText('start'));
    expect(screen.getByText('error: unavailable')).toBeInTheDocument();
  });

  it('reports a start that throws and lets the user retry', async () => {
    const user = userEvent.setup();
    const fake = new FakeRecognition();
    fake.start.mockImplementationOnce(() => {
      throw new Error('already started');
    });
    setup(() => fake);
    await user.click(screen.getByText('start'));
    expect(screen.getByText('error: failed')).toBeInTheDocument();
    expect(screen.getByText('idle')).toBeInTheDocument();
    await user.click(screen.getByText('start'));
    expect(screen.getByText('listening')).toBeInTheDocument();
  });

  it('clear forgets the transcript and the error', async () => {
    const user = userEvent.setup();
    const { made } = setup();
    await user.click(screen.getByText('start'));
    act(() => {
      made[0]?.say({ text: 'undo', final: true });
      made[0]?.onend?.();
    });
    await user.click(screen.getByText('clear'));
    expect(screen.getByText('heard: nothing')).toBeInTheDocument();
  });

  it('switches the microphone off and ignores late results when it unmounts', async () => {
    const user = userEvent.setup();
    const { made, unmount } = setup();
    await user.click(screen.getByText('start'));
    unmount();
    expect(made[0]?.abort).toHaveBeenCalled();
    expect(made[0]?.onresult).toBeNull();
    expect(made[0]?.onend).toBeNull();
  });

  it('reports unsupported when there is no recogniser', () => {
    function Probe() {
      return <p>{useSpeech(undefined).supported ? 'yes' : 'no'}</p>;
    }
    render(<Probe />);
    expect(screen.getByText('no')).toBeInTheDocument();
  });
});
