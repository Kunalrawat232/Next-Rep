// Records a few seconds of speech from the microphone for the cloud recogniser. The browser's own recogniser is
// used wherever it works; this is for the browsers where it does not (Safari and Chrome on iPhone). Everything the
// browser provides is reached through `scope`, so the tests pass a fake one.
import { MAX_RECORDING_MS } from '../../domain/parser/transcribe';
import { createSilenceDetector } from './silence';
import type { SpeechError } from './speech';

export type Recorder = {
  /** Asks for the microphone and starts recording. Rejects with a `SpeechError` kind. */
  start(): Promise<void>;
  /** Ends the recording; the clip is delivered to `onclip`. */
  stop(): void;
  /** Ends the recording and drops the clip (leaving the screen). */
  abort(): void;
  /** Called once with the recording, after `stop`, the silence rule or the time limit. */
  onclip: ((clip: Blob) => void) | null;
  onerror: ((error: SpeechError) => void) | null;
  /** Called last, once, after the clip or an error. */
  onend: (() => void) | null;
};

export type RecorderFactory = () => Recorder;

/** Best first: Chrome and Firefox record webm or ogg, Safari on iPhone records mp4. All are accepted by the endpoint. */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const LEVEL_POLL_MS = 100;

type Track = { stop(): void };
type Stream = { getTracks(): Track[] };
type Analyser = {
  fftSize: number;
  getByteTimeDomainData(data: Uint8Array<ArrayBuffer>): void;
};
type AudioContextLike = {
  createMediaStreamSource(stream: Stream): { connect(node: Analyser): void };
  createAnalyser(): Analyser;
  resume?(): Promise<void>;
  close(): Promise<void>;
};
type MediaRecorderLike = {
  state: string;
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type MediaRecorderConstructor = {
  new (stream: Stream, options?: { mimeType: string }): MediaRecorderLike;
  isTypeSupported?(type: string): boolean;
};

export type RecorderScope = {
  navigator?: {
    mediaDevices?: { getUserMedia?(constraints: { audio: boolean }): Promise<Stream> };
  };
  MediaRecorder?: MediaRecorderConstructor;
  AudioContext?: new () => AudioContextLike;
  webkitAudioContext?: new () => AudioContextLike;
};

function errorOf(error: unknown): SpeechError {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotReadableError') return 'mic-busy';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unavailable';
  return 'failed';
}

/** The browser's recorder, or undefined where there is no microphone or no MediaRecorder. */
export function browserRecorder(
  // The browser's globals narrowed to the few members used here, which is what lets the tests pass a fake.
  scope: RecorderScope = globalThis as unknown as RecorderScope,
): RecorderFactory | undefined {
  const Recording = scope.MediaRecorder;
  if (!Recording || !scope.navigator?.mediaDevices?.getUserMedia) return undefined;
  const mimeType = MIME_TYPES.find((type) => Recording.isTypeSupported?.(type));

  return () => {
    let stream: Stream | null = null;
    let media: MediaRecorderLike | null = null;
    let audio: AudioContextLike | null = null;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let poll: ReturnType<typeof setInterval> | null = null;
    let dropped = false;
    let finished = false;
    const chunks: Blob[] = [];

    function release() {
      for (const timer of timers) clearTimeout(timer);
      timers = [];
      if (poll) clearInterval(poll);
      poll = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      void audio?.close().catch(() => undefined);
      audio = null;
    }

    function finish(failure: SpeechError | null) {
      if (finished) return;
      finished = true;
      release();
      if (!dropped) {
        if (failure) recorder.onerror?.(failure);
        else
          recorder.onclip?.(
            new Blob(chunks, { type: media?.mimeType || mimeType || 'audio/webm' }),
          );
        recorder.onend?.();
      }
    }

    function watchLoudness(source: Stream) {
      const Context = scope.AudioContext ?? scope.webkitAudioContext;
      if (!Context) return;
      try {
        audio = new Context();
        void audio.resume?.().catch(() => undefined);
        const analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        audio.createMediaStreamSource(source).connect(analyser);
        const samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        const detector = createSilenceDetector();
        const startedAt = Date.now();
        poll = setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          let peak = 0;
          for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128);
          if (detector.feed(peak, Date.now() - startedAt)) recorder.stop();
        }, LEVEL_POLL_MS);
      } catch {
        // No loudness reading: the person taps to stop, or the time limit does it.
      }
    }

    const recorder: Recorder = {
      onclip: null,
      onerror: null,
      onend: null,
      async start() {
        try {
          stream = await scope.navigator!.mediaDevices!.getUserMedia!({ audio: true });
        } catch (error) {
          throw errorOf(error);
        }
        if (dropped) return release();
        try {
          media = new Recording(stream, mimeType ? { mimeType } : undefined);
          media.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
          };
          media.onstop = () => finish(chunks.length === 0 ? 'failed' : null);
          media.onerror = () => finish('failed');
          media.start();
        } catch (error) {
          release();
          throw errorOf(error);
        }
        timers.push(setTimeout(() => recorder.stop(), MAX_RECORDING_MS));
        watchLoudness(stream);
      },
      stop() {
        if (media?.state === 'recording') media.stop();
      },
      abort() {
        dropped = true;
        if (media && media.state !== 'inactive') media.stop();
        else release();
        finished = true;
        release();
      },
    };
    return recorder;
  };
}
