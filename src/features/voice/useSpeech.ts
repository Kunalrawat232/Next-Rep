import { useCallback, useEffect, useRef, useState } from 'react';
import {
  browserRecognition,
  errorFor,
  SPEECH_LANGUAGE,
  type Recognition,
  type RecognitionFactory,
  type SpeechError,
} from './speech';

export type Speech = {
  /** False where the browser has no speech recognition: hide the mic and keep tap logging. */
  supported: boolean;
  listening: boolean;
  /** The final words of the last utterance, or null before anything was heard. */
  transcript: string | null;
  error: SpeechError | null;
  /** Starts listening; a call while already listening does nothing. */
  start(): void;
  /** Stops listening; what was heard so far is still delivered. */
  stop(): void;
  /** Forgets the last transcript and error. */
  clear(): void;
};

/**
 * One utterance at a time: tap, speak, get a transcript. The transcript is untrusted input for the parser,
 * never a value to store. `create` is for tests; it defaults to the browser's recogniser.
 */
export function useSpeech(create: RecognitionFactory | undefined = browserRecognition()): Speech {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<SpeechError | null>(null);
  const active = useRef<Recognition | null>(null);
  const factory = useRef(create);
  useEffect(() => {
    factory.current = create;
  });

  const start = useCallback(() => {
    if (active.current || !factory.current) return;
    let recognition: Recognition;
    try {
      recognition = factory.current();
    } catch {
      setError('unavailable');
      return;
    }
    recognition.lang = SPEECH_LANGUAGE;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let heard = '';
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) heard += ` ${result[0]?.transcript ?? ''}`;
      }
    };
    recognition.onerror = (event) => setError(errorFor(event.error));
    recognition.onend = () => {
      if (active.current !== recognition) return;
      active.current = null;
      setListening(false);
      const words = heard.trim();
      if (words) setTranscript(words);
      else setError((current) => current ?? 'silent');
    };
    setTranscript(null);
    setError(null);
    active.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      active.current = null;
      setError('failed');
    }
  }, []);

  const stop = useCallback(() => active.current?.stop(), []);
  const clear = useCallback(() => {
    setTranscript(null);
    setError(null);
  }, []);

  // Leaving the screen switches the microphone off and drops late results.
  useEffect(
    () => () => {
      const recognition = active.current;
      active.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      }
    },
    [],
  );

  return { supported: create !== undefined, listening, transcript, error, start, stop, clear };
}
