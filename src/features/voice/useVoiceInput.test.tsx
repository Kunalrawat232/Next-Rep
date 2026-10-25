import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recorder, RecorderFactory } from './recorder';
import type { Recognition } from './speech';
import { TranscribeServiceProvider, type TranscribeService } from './transcribeService';
import { useVoiceInput } from './useVoiceInput';

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
}

class FakeRecorder implements Recorder {
  onclip: Recorder['onclip'] = null;
  onerror: Recorder['onerror'] = null;
  onend: Recorder['onend'] = null;
  started = 0;
  startFails: string | null = null;
  start = vi.fn(async () => {
    this.started++;
    if (this.startFails) throw this.startFails;
  });
  stop = vi.fn(() => this.finish());
  abort = vi.fn();
  /** What the microphone recorded, delivered when it stops. */
  finish(clip: Blob | null = new Blob([new Uint8Array(3000)], { type: 'audio/mp4' })) {
    if (clip) this.onclip?.(clip);
    this.onend?.();
  }
}

function setup(
  options: {
    service?: TranscribeService | null;
    recorder?: boolean;
    recognition?: boolean;
  } = {},
) {
  const recorders: FakeRecorder[] = [];
  const recognitions: FakeRecognition[] = [];
  const createRecorder: RecorderFactory | undefined =
    options.recorder === false
      ? undefined
      : () => {
          const made = new FakeRecorder();
          recorders.push(made);
          return made;
        };
  const createRecognition =
    options.recognition === false
      ? undefined
      : () => {
          const made = new FakeRecognition();
          recognitions.push(made);
          return made;
        };
  // useSpeech falls back to the browser's recogniser when given none, so a missing one is hidden for the test.
  if (options.recognition === false) vi.stubGlobal('webkitSpeechRecognition', undefined);
  const service =
    options.service === undefined
      ? { transcribe: vi.fn(async () => 'bench press 60 kilo 8 reps') }
      : options.service;
  function Probe() {
    const voice = useVoiceInput(createRecorder, createRecognition);
    return (
      <div>
        <p>supported: {String(voice.supported)}</p>
        <p>cloud: {String(voice.cloud)}</p>
        <p>{voice.listening ? 'listening' : 'idle'}</p>
        <p>{voice.transcribing ? 'transcribing' : 'not transcribing'}</p>
        <p>heard: {voice.transcript ?? 'nothing'}</p>
        <p>error: {voice.error ?? 'none'}</p>
        <button onClick={voice.start}>start</button>
        <button onClick={voice.stop}>stop</button>
        <button onClick={voice.clear}>clear</button>
      </div>
    );
  }
  const tree = <Probe />;
  const view = render(
    service ? (
      <TranscribeServiceProvider service={service}>{tree}</TranscribeServiceProvider>
    ) : (
      tree
    ),
  );
  return { recorders, recognitions, service, view, user: userEvent.setup() };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('useVoiceInput', () => {
  it('uses the browser recogniser while it works, and never the recorder', async () => {
    const { recorders, recognitions, user } = setup();
    expect(screen.getByText('cloud: false')).toBeInTheDocument();
    await user.click(screen.getByText('start'));
    expect(recognitions).toHaveLength(1);
    act(() => {
      recognitions[0]!.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'squat 100 for 5' }], { isFinal: true })],
      });
      recognitions[0]!.onend?.();
    });
    expect(screen.getByText('heard: squat 100 for 5')).toBeInTheDocument();
    expect(recorders).toHaveLength(0);
  });

  it('switches to the cloud recogniser when the browser one ends with nothing, as on iPhone', async () => {
    const { recorders, recognitions, service, user } = setup();
    await user.click(screen.getByText('start'));
    act(() => recognitions[0]!.onend?.());
    // The first tap only learns that the browser cannot do it; the person is told to say it again.
    expect(screen.getByText('error: cloud-on')).toBeInTheDocument();
    expect(recorders).toHaveLength(0);

    await user.click(screen.getByText('start'));
    expect(screen.getByText('cloud: true')).toBeInTheDocument();
    expect(recorders).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('listening')).toBeInTheDocument());
    expect(screen.getByText('error: none')).toBeInTheDocument();

    act(() => recorders[0]!.finish());
    await waitFor(() =>
      expect(screen.getByText('heard: bench press 60 kilo 8 reps')).toBeInTheDocument(),
    );
    expect(
      service && 'transcribe' in service && vi.mocked(service.transcribe),
    ).toHaveBeenCalledTimes(1);
    expect(screen.getByText('idle')).toBeInTheDocument();
    expect(localStorage.getItem('next-rep-voice-mode')).toBe('cloud');
  });

  it('goes straight to the cloud recogniser on the next visit', async () => {
    localStorage.setItem('next-rep-voice-mode', 'cloud');
    const { recorders, recognitions, user } = setup();
    expect(screen.getByText('cloud: true')).toBeInTheDocument();
    await user.click(screen.getByText('start'));
    expect(recognitions).toHaveLength(0);
    expect(recorders).toHaveLength(1);
  });

  it('uses the cloud recogniser from the start where the browser has none', async () => {
    const { recorders, user } = setup({ recognition: false });
    expect(screen.getByText('supported: true')).toBeInTheDocument();
    expect(screen.getByText('cloud: true')).toBeInTheDocument();
    await user.click(screen.getByText('start'));
    expect(recorders).toHaveLength(1);
  });

  it.each(['service-not-allowed', 'network', 'language-not-supported', 'aborted'])(
    'switches after the browser error %s',
    async (code) => {
      const { recognitions, user } = setup();
      await user.click(screen.getByText('start'));
      act(() => {
        recognitions[0]!.onerror?.({ error: code });
        recognitions[0]!.onend?.();
      });
      expect(screen.getByText('error: cloud-on')).toBeInTheDocument();
    },
  );

  it('does not switch when the person simply said nothing, or the microphone is blocked', async () => {
    for (const code of ['no-speech', 'not-allowed']) {
      const { recognitions, user, view } = setup();
      await user.click(screen.getByText('start'));
      act(() => {
        recognitions[0]!.onerror?.({ error: code });
        recognitions[0]!.onend?.();
      });
      expect(
        screen.getByText(code === 'no-speech' ? 'error: no-speech' : 'error: denied'),
      ).toBeInTheDocument();
      expect(screen.getByText('cloud: false')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('never switches without a speech service or a recorder, and shows the browser error', async () => {
    for (const options of [{ service: null }, { recorder: false }]) {
      const { recognitions, recorders, user, view } = setup(options);
      await user.click(screen.getByText('start'));
      act(() => recognitions[0]!.onend?.());
      expect(screen.getByText('error: silent')).toBeInTheDocument();
      expect(screen.getByText('cloud: false')).toBeInTheDocument();
      expect(recorders).toHaveLength(0);
      view.unmount();
    }
  });

  it('is unsupported with neither a recogniser nor a recorder', () => {
    setup({ recognition: false, recorder: false });
    expect(screen.getByText('supported: false')).toBeInTheDocument();
  });

  it('says so when the service gives no words, and when it hears nothing', async () => {
    for (const [words, expected] of [
      [null, 'error: unavailable'],
      ['', 'error: no-speech'],
    ] as const) {
      localStorage.setItem('next-rep-voice-mode', 'cloud');
      const { recorders, user, view } = setup({ service: { transcribe: async () => words } });
      await user.click(screen.getByText('start'));
      await waitFor(() => expect(screen.getByText('listening')).toBeInTheDocument());
      act(() => recorders[0]!.finish());
      await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument());
      expect(screen.getByText('heard: nothing')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows that it is transcribing while the service works', async () => {
    localStorage.setItem('next-rep-voice-mode', 'cloud');
    let release: (words: string) => void = () => undefined;
    const { recorders, user } = setup({
      service: { transcribe: () => new Promise<string>((resolve) => (release = resolve)) },
    });
    await user.click(screen.getByText('start'));
    await waitFor(() => expect(screen.getByText('listening')).toBeInTheDocument());
    act(() => recorders[0]!.finish());
    await waitFor(() => expect(screen.getByText('transcribing')).toBeInTheDocument());
    await act(async () => release('deadlift 100 for 5'));
    await waitFor(() => expect(screen.getByText('heard: deadlift 100 for 5')).toBeInTheDocument());
    expect(screen.getByText('not transcribing')).toBeInTheDocument();
  });

  it('shows the kind of failure when the microphone is refused, and can be tried again', async () => {
    localStorage.setItem('next-rep-voice-mode', 'cloud');
    const made: FakeRecorder[] = [];
    function Probe() {
      const voice = useVoiceInput(() => {
        const recorder = new FakeRecorder();
        recorder.startFails = made.length === 0 ? 'denied' : null;
        made.push(recorder);
        return recorder;
      });
      return (
        <div>
          <p>error: {voice.error ?? 'none'}</p>
          <p>{voice.listening ? 'listening' : 'idle'}</p>
          <button onClick={voice.start}>start</button>
        </div>
      );
    }
    const user = userEvent.setup();
    render(
      <TranscribeServiceProvider service={{ transcribe: async () => 'x' }}>
        <Probe />
      </TranscribeServiceProvider>,
    );
    await user.click(screen.getByText('start'));
    await waitFor(() => expect(screen.getByText('error: denied')).toBeInTheDocument());
    await user.click(screen.getByText('start'));
    expect(made).toHaveLength(2);
    await waitFor(() => expect(screen.getByText('listening')).toBeInTheDocument());
    expect(screen.getByText('error: none')).toBeInTheDocument();
  });

  it('stops the recorder on stop, and starts only one at a time', async () => {
    localStorage.setItem('next-rep-voice-mode', 'cloud');
    const { recorders, user } = setup();
    await user.click(screen.getByText('start'));
    await user.click(screen.getByText('start'));
    expect(recorders).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('listening')).toBeInTheDocument());
    await user.click(screen.getByText('stop'));
    expect(recorders[0]!.stop).toHaveBeenCalled();
  });

  it('switches the microphone off, and drops a late answer, when the screen is left', async () => {
    localStorage.setItem('next-rep-voice-mode', 'cloud');
    const { recorders, user, view } = setup();
    await user.click(screen.getByText('start'));
    view.unmount();
    expect(recorders[0]!.abort).toHaveBeenCalled();
    expect(() => recorders[0]!.finish()).not.toThrow();
  });
});
