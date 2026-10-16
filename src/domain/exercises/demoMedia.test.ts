import { describe, expect, it } from 'vitest';
import { DEMO_MEDIA, DemoEntrySchema, demoMediaFor } from './demoMedia';

const entry = {
  gif: 'videos/0001-2gPfomN.gif',
  thumb: 'images/0001-2gPfomN.jpg',
  secondary: ['abs' as const],
};

describe('demo media', () => {
  it('builds both addresses from the one base URL', () => {
    expect(demoMediaFor(entry)).toEqual({
      gifUrl: `${DEMO_MEDIA.baseUrl}/videos/0001-2gPfomN.gif`,
      thumbUrl: `${DEMO_MEDIA.baseUrl}/images/0001-2gPfomN.jpg`,
    });
  });

  it('shows nothing at all when demonstrations are switched off', () => {
    expect(demoMediaFor(entry, false)).toBeNull();
  });

  it('has nothing for an exercise without an entry', () => {
    expect(demoMediaFor(undefined)).toBeNull();
  });

  it('is pinned to a commit and served over https', () => {
    expect(DEMO_MEDIA.baseUrl).toMatch(/^https:\/\/.+@[0-9a-f]{40}$/);
  });

  it('only accepts paths inside the dataset, never full URLs or climbing paths', () => {
    expect(DemoEntrySchema.safeParse(entry).success).toBe(true);
    for (const bad of [
      { ...entry, gif: 'https://evil.example/x.gif' },
      { ...entry, gif: 'videos/../../x.gif' },
      { ...entry, thumb: 'images/a.png' },
      { ...entry, secondary: ['wings'] },
    ])
      expect(DemoEntrySchema.safeParse(bad).success).toBe(false);
  });

  it('names the owner of the media in its credit', () => {
    expect(DEMO_MEDIA.credit.note).toMatch(/non-commercial/i);
    expect(DEMO_MEDIA.credit.ownerUrl).toBe('https://gymvisual.com/');
  });
});
