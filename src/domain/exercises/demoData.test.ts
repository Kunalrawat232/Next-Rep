import { describe, expect, it } from 'vitest';
import demo from '../exercises.demo.json';
import extended from '../exercises.extended.json';
import seed from '../exercises.seed.json';
import photos from '../exercises.photos.json';
import { DemoMapSchema, PhotoMapSchema } from './demoMedia';

const ids = new Set([...seed, ...extended].map((e) => e.id));

describe('the committed demo map (src/domain/exercises.demo.json)', () => {
  const map = DemoMapSchema.parse(demo);
  const entries = Object.entries(map);

  it('is valid, and only holds paths inside the dataset', () => {
    expect(entries.length).toBeGreaterThan(800);
  });

  it('only names exercises that exist in the catalogue', () => {
    expect(entries.filter(([id]) => !ids.has(id)).map(([id]) => id)).toEqual([]);
  });

  it('pairs each animation with the thumbnail of the same media', () => {
    const stem = (path: string) => path.replace(/^.*\//, '').replace(/\.\w+$/, '');
    expect(entries.filter(([, e]) => stem(e.gif) !== stem(e.thumb))).toEqual([]);
  });

  it('never lists the same muscle twice for one exercise', () => {
    expect(entries.filter(([, e]) => new Set(e.secondary).size !== e.secondary.length)).toEqual([]);
  });

  it('shares an animation only where the catalogue itself has the same exercise twice', () => {
    // The hand-made and the imported lists overlap (for example "Lateral Raise" and "Dumbbell Lateral Raise"),
    // and the reviewed overrides in scripts/exercise-demo-overrides.json point the hand-made one at the same
    // row. A jump in this number means the matching started collapsing different exercises.
    const gifs = entries.map(([, e]) => e.gif);
    expect(gifs.length - new Set(gifs).size).toBeLessThanOrEqual(25);
  });
});

describe('the committed photo map (src/domain/exercises.photos.json)', () => {
  const map = PhotoMapSchema.parse(photos);
  const entries = Object.entries(map);

  it('is valid, and only names exercises that exist in the catalogue', () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.filter(([id]) => !ids.has(id)).map(([id]) => id)).toEqual([]);
  });

  it('covers the popular hand-made exercises', () => {
    const covered = seed.filter((e) => map[e.id] !== undefined).length;
    expect(covered).toBeGreaterThanOrEqual(50);
  });

  it('uses each photo folder at most as often as the catalogue repeats the exercise', () => {
    const dirs = entries.map(([, dir]) => dir);
    expect(dirs.length - new Set(dirs).size).toBeLessThanOrEqual(10);
  });
});
