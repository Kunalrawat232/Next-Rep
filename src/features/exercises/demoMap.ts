import { useEffect, useState } from 'react';
import { DemoMapSchema, type DemoEntry, type DemoMap } from '../../domain/exercises/demoMedia';

let loading: Promise<DemoMap> | null = null;

/**
 * The demo map (about 150 KB), loaded the first time it is needed and kept. It is a separate chunk, so the
 * rest of the app never pays for it, and it is checked against its schema like any other data.
 */
export function loadDemoMap(): Promise<DemoMap> {
  loading ??= import('../../domain/exercises.demo.json')
    .then((module) => DemoMapSchema.parse(module.default))
    .catch((error: unknown) => {
      loading = null; // a failed load is tried again next time
      throw error;
    });
  return loading;
}

export type DemoEntryState =
  { status: 'loading' } | { status: 'ready'; entry: DemoEntry | undefined };

/** The demo entry of one exercise. If the map cannot be loaded the exercise simply has no demo. */
export function useDemoEntry(exerciseId: string | undefined): DemoEntryState {
  const [loaded, setLoaded] = useState<DemoMap | null | 'failed'>(null);
  useEffect(() => {
    let current = true;
    loadDemoMap()
      .then((map) => current && setLoaded(map))
      .catch(() => current && setLoaded('failed'));
    return () => {
      current = false;
    };
  }, []);
  if (loaded === null) return { status: 'loading' };
  if (loaded === 'failed' || exerciseId === undefined) return { status: 'ready', entry: undefined };
  return { status: 'ready', entry: loaded[exerciseId] };
}
