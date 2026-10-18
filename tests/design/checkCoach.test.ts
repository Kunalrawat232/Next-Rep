// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COACH_REPLY_MAX } from '../../src/domain/coach/schemas';

const script = readFileSync(new URL('../../scripts/check-coach.mjs', import.meta.url), 'utf8');

describe('npm run check:coach', () => {
  it('asks the model with the same response schema the function sends, so a schema Gemini refuses shows up here', () => {
    expect(script).toContain('z.toJSONSchema(');
    expect(script).toContain('onTopic: z.boolean()');
    // CoachModelOutputSchema allows a reply of twice the length the app keeps.
    expect(script).toContain(`reply: z.string().max(${COACH_REPLY_MAX * 2})`);
  });
});
