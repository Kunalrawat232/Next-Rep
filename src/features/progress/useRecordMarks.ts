import { useEffect, useState } from 'react';
import { ignoreClosed } from '../../data/local';
import { recordMarks, type RecordKind } from '../../domain/records';
import { useUnit } from '../settings/UnitProvider';
import { useLogStore, useSyncStatus } from '../sync';

const EMPTY: ReadonlyMap<string, RecordKind> = new Map();

/**
 * Which sets of these exercises were personal records when they were logged. Worked out from every
 * set of each exercise (not stored), so undoing a set fixes the badges. The marks of a set depend
 * only on the sets before it, so while a new read is under way the last result is still right for
 * every set that was already there, and the badges do not blink off.
 */
export function useRecordMarks(exerciseIds: string[]): ReadonlyMap<string, RecordKind> {
  const store = useLogStore();
  const { unit } = useUnit();
  const { pending, failed, syncing, pulledVersion } = useSyncStatus();
  const idsKey = [...new Set(exerciseIds)].sort().join(',');
  const [marks, setMarks] = useState<ReadonlyMap<string, RecordKind>>(EMPTY);

  useEffect(() => {
    if (idsKey === '') return;
    let current = true;
    store
      .setsForExercises(idsKey.split(','))
      .then((sets) => {
        if (current) setMarks(recordMarks(sets, unit));
      })
      .catch((error: unknown) => {
        try {
          ignoreClosed(error);
        } catch {
          // Badges are an extra: if the read fails, the sets are shown without them.
          if (current) setMarks(EMPTY);
        }
      });
    return () => {
      current = false;
    };
  }, [store, unit, idsKey, pending, failed, syncing, pulledVersion]);

  return idsKey === '' ? EMPTY : marks;
}
