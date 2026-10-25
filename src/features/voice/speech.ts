/** The small part of the browser's SpeechRecognition that the app uses (TypeScript's DOM types do not ship it). */
export type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

export type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export type RecognitionFactory = () => Recognition;

/** What went wrong, in words a screen can turn into a friendly message. */
export type SpeechError = 'denied' | 'service-off' | 'no-speech' | 'unavailable' | 'failed';

/** Recognition language: English as spoken in India, which also hears Hinglish gym talk best. */
export const SPEECH_LANGUAGE = 'en-IN';

type Constructor = new () => Recognition;

/** The browser's recogniser, or undefined where there is none (Firefox, some in-app browsers). */
export function browserRecognition(): RecognitionFactory | undefined {
  const scope = globalThis as {
    SpeechRecognition?: Constructor;
    webkitSpeechRecognition?: Constructor;
  };
  const Ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return Ctor ? () => new Ctor() : undefined;
}

export function errorFor(code: string): SpeechError {
  switch (code) {
    case 'not-allowed':
      return 'denied';
    case 'service-not-allowed':
      return 'service-off';
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
    case 'network':
    case 'language-not-supported':
      return 'unavailable';
    default:
      return 'failed';
  }
}
