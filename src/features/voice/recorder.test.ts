import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RECORDING_MS } from '../../domain/parser/transcribe';
import { browserRecorder, type RecorderScope } from './recorder';

class FakeMedia {
  static supported = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  static isTypeSupported = (type: string) => FakeMedia.supported.includes(type);
  state = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  options: { mimeType: string } | undefined;
  constructor(_stream: unknown, options?: { mimeType: string }) {
    this.options = options;
    this.mimeType = options?.mimeType ?? '';
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
  /** What the microphone captured. */
  capture(bytes = 4000) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
  }
}

function setup(over: Partial<RecorderScope> = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const getUserMedia = vi.fn(async () => stream);
  const made: FakeMedia[] = [];
  class Media extends FakeMedia {
    constructor(s: unknown, o?: { mimeType: string }) {
      super(s, o);
      made.push(this);
    }
  }
  const scope: RecorderScope = {
    navigator: { mediaDevices: { getUserMedia } },
    MediaRecorder: Media as unknown as RecorderScope['MediaRecorder'],
    ...over,
  };
  return { scope, track, getUserMedia, media: () => made.at(-1)! };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('browserRecorder', () => {
  it('is undefined where there is no MediaRecorder or no microphone access', () => {
    expect(browserRecorder({})).toBeUndefined();
    expect(browserRecorder({ MediaRecorder: FakeMedia as never })).toBeUndefined();
    expect(
      browserRecorder({ navigator: { mediaDevices: {} }, MediaRecorder: FakeMedia as never }),
    ).toBeUndefined();
  });

  it('records, and delivers one clip of the recorded type when stopped, then releases the microphone', async () => {
    const { scope, track, media } = setup();
    const recorder = browserRecorder(scope)!();
    const clip = vi.fn();
    const end = vi.fn();
    recorder.onclip = clip;
    recorder.onend = end;
    await recorder.start();
    expect(media().options).toEqual({ mimeType: 'audio/webm;codecs=opus' });
    media().capture();
    recorder.stop();
    expect(clip).toHaveBeenCalledTimes(1);
    const blob = clip.mock.calls[0]![0] as Blob;
    expect(blob.size).toBe(4000);
    expect(blob.type).toBe('audio/webm;codecs=opus');
    expect(end).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalled();
  });

  it('uses mp4 where the browser can only record that (Safari on iPhone)', async () => {
    FakeMedia.supported = ['audio/mp4'];
    try {
      const { scope, media } = setup();
      const recorder = browserRecorder(scope)!();
      await recorder.start();
      expect(media().options).toEqual({ mimeType: 'audio/mp4' });
    } finally {
      FakeMedia.supported = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    }
  });

  it('stops by itself at the time limit', async () => {
    const { scope, media } = setup();
    const recorder = browserRecorder(scope)!();
    const clip = vi.fn();
    recorder.onclip = clip;
    await recorder.start();
    media().capture();
    vi.advanceTimersByTime(MAX_RECORDING_MS - 1);
    expect(clip).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(clip).toHaveBeenCalledTimes(1);
  });

  it('stops by itself when speech is followed by quiet', async () => {
    let level = 128;
    class Context {
      createAnalyser() {
        return {
          fftSize: 0,
          getByteTimeDomainData: (data: Uint8Array) => data.fill(level),
        };
      }
      createMediaStreamSource() {
        return { connect: () => undefined };
      }
      resume = async () => undefined;
      close = async () => undefined;
    }
    const { scope, media } = setup({ AudioContext: Context as never });
    const recorder = browserRecorder(scope)!();
    const clip = vi.fn();
    recorder.onclip = clip;
    await recorder.start();
    media().capture();
    vi.advanceTimersByTime(1500);
    expect(clip).not.toHaveBeenCalled();
    level = 200;
    vi.advanceTimersByTime(300);
    level = 128;
    vi.advanceTimersByTime(1000);
    expect(clip).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(clip).toHaveBeenCalledTimes(1);
  });

  it('still records when the loudness cannot be read', async () => {
    class Broken {
      constructor() {
        throw new Error('no audio context');
      }
    }
    const { scope, media } = setup({ AudioContext: Broken as never });
    const recorder = browserRecorder(scope)!();
    const clip = vi.fn();
    recorder.onclip = clip;
    await recorder.start();
    media().capture();
    recorder.stop();
    expect(clip).toHaveBeenCalledTimes(1);
  });

  it('turns refusals into friendly kinds', async () => {
    for (const [name, kind] of [
      ['NotAllowedError', 'denied'],
      ['NotFoundError', 'unavailable'],
      ['NotReadableError', 'mic-busy'],
      ['AbortError', 'failed'],
    ] as const) {
      const { scope } = setup({
        navigator: {
          mediaDevices: {
            getUserMedia: async () => {
              throw Object.assign(new Error('x'), { name });
            },
          },
        },
      });
      await expect(browserRecorder(scope)!().start(), name).rejects.toBe(kind);
    }
  });

  it('reports an empty recording as a failure, never as a clip', async () => {
    const { scope, media } = setup();
    const recorder = browserRecorder(scope)!();
    const clip = vi.fn();
    const failure = vi.fn();
    recorder.onclip = clip;
    recorder.onerror = failure;
    await recorder.start();
    recorder.stop();
    expect(clip).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith('failed');
    expect(media().state).toBe('inactive');
  });

  it('drops the clip and releases the microphone when aborted, and says nothing more', async () => {
    const { scope, track, media } = setup();
    const recorder = browserRecorder(scope)!();
    const clip = vi.fn();
    const end = vi.fn();
    recorder.onclip = clip;
    recorder.onend = end;
    await recorder.start();
    media().capture();
    recorder.abort();
    expect(clip).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    vi.advanceTimersByTime(MAX_RECORDING_MS * 2);
    expect(clip).not.toHaveBeenCalled();
  });

  it('releases the microphone when aborted before it was granted', async () => {
    let grant: (stream: unknown) => void = () => undefined;
    const track = { stop: vi.fn() };
    const { scope } = setup({
      navigator: {
        mediaDevices: {
          getUserMedia: () =>
            new Promise((resolve) => {
              grant = resolve as typeof grant;
            }) as never,
        },
      },
    });
    const recorder = browserRecorder(scope)!();
    const started = recorder.start();
    recorder.abort();
    grant({ getTracks: () => [track] });
    await started;
    expect(track.stop).toHaveBeenCalled();
  });
});
