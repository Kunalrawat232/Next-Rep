// Gemini fallback endpoint. Implemented in Phase 3 (see docs/architecture/api-contracts.md).
export function POST(): Response {
  return Response.json({ status: 'unavailable' }, { status: 501 });
}
