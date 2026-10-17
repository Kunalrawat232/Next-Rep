import { COACH_QUESTION_MAX } from './schemas.js';

/** Control characters and the invisible ones that can hide text (including text-direction marks and line separators), which a question or a name never needs. */
/* eslint-disable no-control-regex -- stripping control characters is the point */
const HIDDEN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/* eslint-enable no-control-regex */

/** Text as it is sent or kept: no hidden characters, spaces tidied, and no longer than `max`. */
export function cleanText(text: string, max: number): string {
  return text
    .replace(HIDDEN, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** A question as it is sent: cleaned and no longer than the limit. */
export function cleanQuestion(text: string): string {
  return cleanText(text, COACH_QUESTION_MAX);
}
