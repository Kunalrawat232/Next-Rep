import { useCallback, useEffect, useRef, useState } from 'react';
import {
  browserRecorder,
  type Recorder,
  type RecorderFactory,
  type RecorderFailure,
} from './recorder';
import type { RecognitionFactory, SpeechError } from './speech';
import { useSpeech, type Speech } from './useSpeech';
import { useTranscribeService } from './transcribeService';

export type VoiceInput = Speech & {
  /** True while the recording is being turned into words by the cloud service. */
  transcribing: boolean;
  /** A short, safe name of what went wrong with the cloud recogniser, to show next to the error. */
  detail: string | null;
  /** True when the cloud recogniser is in use, so the screen can say the voice leaves the device. */
  cloud: boolean;
};

const MODE_KEY = 'next-rep-voice-mode';
/** What the browser's recogniser does when it cannot work here: the cloud one is tried next. */
const SWITCHES: ReadonlySet<SpeechError> = new Set([
  'silent',
  'service-off',
  'unavailable',
  'failed',
]);
function remembersCloud(): boolean {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'cloud';
  } catch {
    return false;
  }
}

function rememberCloud() {
  try {
    window.localStorage.setItem(MODE_KEY, 'cloud');
  } catch {
    // Storage blocked: the switch simply happens again next visit.
  }
}

const asFailure = (failure: unknown): RecorderFailure =>
  typeof failure === 'object' && failure !== null && 'kind' in failure && 'detail' in failure
    ? (failure as RecorderFailure)
    : { kind: 'failed', detail: 'unknown' };

/**
 * One utterance at a time, like `useSpeech`, with a second way to hear it. The browser's own recogniser is used
 * wherever it works. Where it does not (it ends with no words and no error, as on iPhone, or the browser has none)
 * and a speech service is provided, the mic records a few seconds and the service turns them into words; the choice
 * is remembered. The words are untrusted either way: they go to the same parser and confirm card. `createRecorder`
 * and `createRecognition` are for tests.
 */
export function useVoiceInput(
  createRecorder: RecorderFactory | undefined = browserRecorder(),
  createRecognition?: RecognitionFactory,
): VoiceInput {
  const service = useTranscribeService();
  const browser = useSpeech(createRecognition);
  const canCloud = createRecorder !== undefined && service !== null;
  const [chosen, setChosen] = useState(remembersCloud);
  const cloud = canCloud && (chosen || !browser.supported);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<SpeechError | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const active = useRef<Recorder | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ createRecorder, service });
  useEffect(() => {
    latest.current = { createRecorder, service };
  });

  // The browser's recogniser just failed in a way that means it cannot work here: the next tap uses the cloud one.
  const { error: browserError, clear: clearBrowser } = browser;
  const switching = canCloud && !cloud && browserError !== null && SWITCHES.has(browserError);

  const startCloud = useCallback(() => {
    const { createRecorder: create, service: speechService } = latest.current;
    if (active.current || !create || !speechService) return;
    setTranscript(null);
    setError(null);
    setDetail(null);
    const recorder = create();
    active.current = recorder;
    recorder.onclip = (clip) => {
      if (!mounted.current) return;
      setTranscribing(true);
      speechService
        .transcribe(clip)
        .then((result) => {
          if (!mounted.current) return;
          if (!result.ok) {
            setError(result.kind);
            setDetail(result.reason);
          } else if (result.text === '') setError('no-speech');
          else setTranscript(result.text);
        })
        .catch(() => {
          if (!mounted.current) return;
          setError('unavailable');
          setDetail('crashed');
        })
        .finally(() => mounted.current && setTranscribing(false));
    };
    recorder.onerror = (failure) => {
      if (!mounted.current) return;
      setError(failure.kind);
      setDetail(failure.detail);
    };
    recorder.onend = () => {
      if (active.current !== recorder) return;
      active.current = null;
      if (mounted.current) setRecording(false);
    };
    recorder.start().then(
      () => {
        if (active.current === recorder && mounted.current) setRecording(true);
      },
      (failure: unknown) => {
        if (active.current === recorder) active.current = null;
        if (!mounted.current) return;
        const { kind, detail: name } = asFailure(failure);
        setError(kind);
        setDetail(name);
      },
    );
  }, []);

  const { start: startBrowser, stop: stopBrowser } = browser;
  const start = useCallback(() => {
    if (switching) {
      rememberCloud();
      setChosen(true);
      clearBrowser();
      startCloud();
    } else if (cloud) startCloud();
    else startBrowser();
  }, [switching, cloud, startCloud, startBrowser, clearBrowser]);
  const stop = useCallback(
    () => (cloud ? active.current?.stop() : stopBrowser()),
    [cloud, stopBrowser],
  );
  const clear = useCallback(() => {
    setTranscript(null);
    setError(null);
    setDetail(null);
    clearBrowser();
  }, [clearBrowser]);

  // Leaving the screen switches the microphone off and drops a late answer.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const recorder = active.current;
      active.current = null;
      if (recorder) {
        recorder.onclip = null;
        recorder.onerror = null;
        recorder.onend = null;
        recorder.abort();
      }
    };
  }, []);

  return {
    supported: browser.supported || canCloud,
    listening: cloud ? recording : browser.listening,
    transcript: cloud ? transcript : browser.transcript,
    error: switching ? 'cloud-on' : cloud ? error : (error ?? browser.error),
    transcribing,
    detail: cloud ? detail : null,
    cloud,
    start,
    stop,
    clear,
  };
}
