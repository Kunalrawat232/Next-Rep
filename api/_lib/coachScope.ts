// A cheap check, before the model is asked, for questions that are plainly not about the gym or diet. It is not
// the main defence (the prompt and the model's own `onTopic` answer are); it only turns the obvious cases away
// without spending a model call. Kept short and exact on purpose: a gym question must never be caught here.

/** Only digits, spaces and arithmetic symbols, with at least one operator: "2+2", "12 / 4 =". ("5x5" is a gym question.) */
const ARITHMETIC = /^[\s\d.,()%+\-*/^=×÷]+$/;
const HAS_OPERATOR = /[+\-*/^=×÷]/;

const OBVIOUS: RegExp[] = [
  /\b(?:what(?:'|’)?s|what is|how(?:'|’)?s|tell me)\s+(?:the\s+)?weather\b/i,
  /\bweather\s+(?:today|tomorrow|forecast|in\s+[a-z])/i,
  /\bsolve\b[^?]*=/i,
  /\b(?:stock|share|bitcoin|crypto|ethereum)\s+price\b/i,
  /\bcapital\s+(?:city\s+)?of\b/i,
  /\b(?:who is|who's)\s+the\s+(?:president|prime minister)\b/i,
  /\bwrite\s+(?:me\s+)?(?:a|an|some)\s+(?:python|javascript|java|sql|code|script|poem|story|essay|song|email|letter)\b/i,
];

/** True for a question that plainly has nothing to do with the gym or diet. */
export function isObviouslyOffTopic(question: string): boolean {
  const text = question.trim();
  if (ARITHMETIC.test(text) && /\d/.test(text) && HAS_OPERATOR.test(text)) return true;
  return OBVIOUS.some((pattern) => pattern.test(text));
}
