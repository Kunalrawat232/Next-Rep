import { useEffect, useState } from 'react';
import {
  DemoMapSchema,
  PhotoMapSchema,
  type DemoEntry,
  type DemoMap,
  type PhotoMap,
} from '../../domain/exercises/demoMedia';

type Maps = { demos: DemoMap; photos: PhotoMap };

let loading: Promise<Maps> | null = null;

/**
 * The demo maps (about 150 KB for the animations, 9 KB for the photos), loaded the first time they are needed
 * and kept. They are separate chunks that are only fetched and parsed on the exercise page (the service
 * worker still precaches them, like other app code), and each is checked against its schema.
 */
export function loadDemoMaps(): Promise<Maps> {
  loading ??= Promise.all([
    import('../../domain/exercises.demo.json').then((m) => DemoMapSchema.parse(m.default)),
    import('../../domain/exercises.photos.json').then((m) => PhotoMapSchema.parse(m.default)),
  ])
    .then(([demos, photos]) => ({ demos, photos }))
    .catch((error: unknown) => {
      loading = null; // a failed load is tried again next time
      throw error;
    });
  return loading;
}

export type DemoSourcesState =
  | { status: 'loading' }
  | { status: 'ready'; entry: DemoEntry | undefined; photoDir: string | undefined };

/** The demo sources of one exercise. If the maps cannot be loaded the exercise simply has no demo. */
export function useDemoSources(exerciseId: string | undefined): DemoSourcesState {
  const [loaded, setLoaded] = useState<Maps | null | 'failed'>(null);
  useEffect(() => {
    let current = true;
    loadDemoMaps()
      .then((maps) => current && setLoaded(maps))
      .catch(() => current && setLoaded('failed'));
    return () => {
      current = false;
    };
  }, []);
  if (loaded === null) return { status: 'loading' };
  if (loaded === 'failed' || exerciseId === undefined)
    return { status: 'ready', entry: undefined, photoDir: undefined };
  return { status: 'ready', entry: loaded.demos[exerciseId], photoDir: loaded.photos[exerciseId] };
}
