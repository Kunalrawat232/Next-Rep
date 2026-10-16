import { describe, expect, it } from 'vitest';
import {
  DEMO_MEDIA,
  DemoEntrySchema,
  demoMediaFor,
  PHOTO_MEDIA,
  PhotoDirSchema,
} from './demoMedia';

const entry = {
  gif: 'videos/0001-2gPfomN.gif',
  thumb: 'images/0001-2gPfomN.jpg',
  secondary: ['abs' as const],
};
const both = { photos: true, gifs: true };

describe('demo media', () => {
  it('builds the animation addresses from the one base URL', () => {
    expect(demoMediaFor({ entry })).toEqual({
      kind: 'gif',
      gifUrl: `${DEMO_MEDIA.baseUrl}/videos/0001-2gPfomN.gif`,
      thumbUrl: `${DEMO_MEDIA.baseUrl}/images/0001-2gPfomN.jpg`,
    });
  });

  it('builds the two photo addresses from their own base URL', () => {
    expect(demoMediaFor({ photoDir: 'Barbell_Squat' })).toEqual({
      kind: 'photos',
      startUrl: `${PHOTO_MEDIA.baseUrl}/Barbell_Squat/0.jpg`,
      endUrl: `${PHOTO_MEDIA.baseUrl}/Barbell_Squat/1.jpg`,
    });
  });

  it('prefers the photos, and falls back to the animation', () => {
    expect(demoMediaFor({ entry, photoDir: 'Barbell_Squat' })?.kind).toBe('photos');
    expect(demoMediaFor({ entry })?.kind).toBe('gif');
  });

  it('has nothing for an exercise without either', () => {
    expect(demoMediaFor({})).toBeNull();
  });

  it('switches each source off on its own, and both off shows nothing', () => {
    const sources = { entry, photoDir: 'Barbell_Squat' };
    expect(demoMediaFor(sources, { photos: false, gifs: true })?.kind).toBe('gif');
    expect(demoMediaFor(sources, { photos: true, gifs: false })?.kind).toBe('photos');
    expect(demoMediaFor(sources, { photos: false, gifs: false })).toBeNull();
    expect(demoMediaFor(sources, both)?.kind).toBe('photos');
  });

  it('pins both sources to a commit and serves them over https', () => {
    expect(DEMO_MEDIA.baseUrl).toMatch(/^https:\/\/.+@[0-9a-f]{40}$/);
    expect(PHOTO_MEDIA.baseUrl).toMatch(/^https:\/\/.+@[0-9a-f]{40}\/exercises$/);
  });

  it('only accepts paths inside the datasets, never full URLs or climbing paths', () => {
    expect(DemoEntrySchema.safeParse(entry).success).toBe(true);
    for (const bad of [
      { ...entry, gif: 'https://evil.example/x.gif' },
      { ...entry, gif: 'videos/../../x.gif' },
      { ...entry, thumb: 'images/a.png' },
      { ...entry, secondary: ['wings'] },
    ])
      expect(DemoEntrySchema.safeParse(bad).success).toBe(false);
    for (const good of ['Barbell_Squat', 'Close-Grip_Barbell_Bench_Press', '3_4_Sit-Up'])
      expect(PhotoDirSchema.safeParse(good).success).toBe(true);
    for (const bad of ['../x', 'a/b', 'https://evil.example', 'a.b', '', 'a b'])
      expect(PhotoDirSchema.safeParse(bad).success).toBe(false);
  });

  it('names the owner and the licence of each source in its credit', () => {
    expect(DEMO_MEDIA.credit.note).toMatch(/non-commercial/i);
    expect(DEMO_MEDIA.credit.ownerUrl).toBe('https://gymvisual.com/');
    expect(PHOTO_MEDIA.credit.note).toMatch(/unlicense/i);
  });
});
