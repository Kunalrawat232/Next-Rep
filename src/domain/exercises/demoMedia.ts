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

export type DemoMedia = { gifUrl: string; thumbUrl: string };

/** The addresses to show, or null when demonstrations are off or this exercise has none. */
export function demoMediaFor(
  entry: DemoEntry | undefined,
  enabled: boolean = DEMO_MEDIA.enabled,
): DemoMedia | null {
  if (!enabled || !entry) return null;
  return {
    gifUrl: `${DEMO_MEDIA.baseUrl}/${entry.gif}`,
    thumbUrl: `${DEMO_MEDIA.baseUrl}/${entry.thumb}`,
  };
}
