import { z } from 'zod';
import { MUSCLES } from './muscles';

/**
 * Where exercise demonstrations come from. This is the ONLY place that knows the provider: swap `baseUrl`,
 * or set `enabled` to false to switch every demonstration off, and no component changes.
 *
 * The media is hotlinked, never copied into the repository, the build or the offline cache. It is
 * © Gym visual (https://gymvisual.com/); see THIRD_PARTY_NOTICES.md and ADR-013.
 */
export const DEMO_MEDIA = {
  enabled: true,
  /** The dataset's files, pinned to one commit so they cannot change or disappear under the app. */
  baseUrl:
    'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd',
  credit: {
    owner: 'Gym visual',
    ownerUrl: 'https://gymvisual.com/',
    dataset: 'hasaneyldrm/exercises-dataset',
    datasetUrl: 'https://github.com/hasaneyldrm/exercises-dataset',
    note: 'Demonstrations are © Gym visual, shown here for non-commercial use. They are loaded from the open exercises dataset and are not stored by Next Rep.',
  },
} as const;

/** What the build step records per exercise: paths inside the dataset, never full URLs. */
export const DemoEntrySchema = z.object({
  gif: z.string().regex(/^videos\/[\w.-]+\.gif$/),
  thumb: z.string().regex(/^images\/[\w.-]+\.jpg$/),
  secondary: z.array(z.enum(MUSCLES)),
});
export type DemoEntry = z.infer<typeof DemoEntrySchema>;

export const DemoMapSchema = z.record(z.uuid(), DemoEntrySchema);
export type DemoMap = z.infer<typeof DemoMapSchema>;

/**
 * Sharper photos for the popular exercises: a start pose and an end pose, which the app crossfades. They come
 * from https://github.com/yuhonas/free-exercise-db (Unlicense) and are hotlinked the same way. An exercise
 * with photos shows them; every other exercise falls back to the animation above.
 */
export const PHOTO_MEDIA = {
  enabled: true,
  /** Pinned to one commit, like the animations. */
  baseUrl:
    'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises',
  credit: {
    dataset: 'yuhonas/free-exercise-db',
    datasetUrl: 'https://github.com/yuhonas/free-exercise-db',
    note: 'Exercise photos from free-exercise-db (Unlicense, public domain).',
  },
} as const;

/** One folder of the photo dataset per exercise, such as "Barbell_Squat". Never a path or a URL. */
export const PhotoDirSchema = z.string().regex(/^[\w-]+$/);
export const PhotoMapSchema = z.record(z.uuid(), PhotoDirSchema);
export type PhotoMap = z.infer<typeof PhotoMapSchema>;

export type DemoMedia =
  | { kind: 'photos'; startUrl: string; endUrl: string }
  | { kind: 'gif'; gifUrl: string; thumbUrl: string };

export type DemoSources = {
  /** The animation entry (Gym visual), if this exercise has one. */
  entry?: DemoEntry | undefined;
  /** The photo folder (free-exercise-db), if this exercise has one. */
  photoDir?: string | undefined;
};

/**
 * What to show for an exercise: its photos if it has any, else its animation, else nothing (null). The two
 * sources can be switched off independently, so a source can be dropped without touching a component.
 */
export function demoMediaFor(
  { entry, photoDir }: DemoSources,
  enabled: { photos: boolean; gifs: boolean } = {
    photos: PHOTO_MEDIA.enabled,
    gifs: DEMO_MEDIA.enabled,
  },
): DemoMedia | null {
  if (enabled.photos && photoDir !== undefined)
    return {
      kind: 'photos',
      startUrl: `${PHOTO_MEDIA.baseUrl}/${photoDir}/0.jpg`,
      endUrl: `${PHOTO_MEDIA.baseUrl}/${photoDir}/1.jpg`,
    };
  if (enabled.gifs && entry)
    return {
      kind: 'gif',
      gifUrl: `${DEMO_MEDIA.baseUrl}/${entry.gif}`,
      thumbUrl: `${DEMO_MEDIA.baseUrl}/${entry.thumb}`,
    };
  return null;
}
