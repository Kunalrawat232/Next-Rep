/**
 * Decides when a recording can stop on its own: speech was heard, and then it went quiet for a moment. Fed the
 * loudness (0 to 1) of the microphone a few times a second. Pure, so it is tested without a microphone.
 */
export type SilenceOptions = {
  /** Loudness at or above this counts as speech. */
  speechLevel?: number;
  /** Quiet for this long after speech means the person has finished. */
  silenceMs?: number;
};

export const SPEECH_LEVEL = 0.06;
export const SILENCE_MS = 1200;

export function createSilenceDetector({
  speechLevel = SPEECH_LEVEL,
  silenceMs = SILENCE_MS,
}: SilenceOptions = {}) {
  let heard = false;
  let lastLoud = 0;
  return {
    /** True when the recording should stop now. */
    feed(level: number, nowMs: number): boolean {
      if (level >= speechLevel) {
        heard = true;
        lastLoud = nowMs;
      }
      return heard && nowMs - lastLoud >= silenceMs;
    },
  };
}
