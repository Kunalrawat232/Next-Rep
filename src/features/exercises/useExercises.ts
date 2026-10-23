import { useCallback, useEffect, useState } from 'react';
import type { Exercise } from '../../domain/exercises';
import { parseExercises } from '../../domain/exercises/catalog';
import curatedJson from '../../domain/exercises.seed.json';
import type { Failure } from '../../lib/result';
import { within } from '../../lib/withTimeout';
import type { ExerciseService } from './types';

export type ExercisesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; exercises: Exercise[]; customProblem: Failure | null };

const curated = parseExercises(curatedJson, 'curated');

// The imported library is a separate chunk, fetched when an exercise screen first opens, so the
// other screens do not pay for it. Once loaded it is kept.
let importedPromise: Promise<Exercise[]> | null = null;
function loadImported(): Promise<Exercise[]> {
  importedPromise ??= import('../../domain/exercises.extended.json')
    .then((module) => parseExercises(module.default, 'imported'))
    .catch((error: unknown) => {
      importedPromise = null; // let a retry fetch it again
      throw error;
    });
  return importedPromise;
}

/**
 * The built-in exercises ship with the app, so they work offline. Only the user's own exercises
 * come from the network; if those fail, the rest is still usable and `customProblem` says why.
 */
export function useExercises(service: ExerciseService): {
  state: ExercisesState;
  reload: () => void;
} {
  const [state, setState] = useState<ExercisesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([
      loadImported(),
      // The server's answer, or after a few seconds "offline": the built-in exercises show without it.
      // A browser that already knows it is offline has nothing to wait for.
      (navigator.onLine === false ? Promise.resolve(null) : within(service.listCustom()))
        .then((answer) => answer ?? ({ status: 'error', reason: 'offline' } as const))
        .catch((): { status: 'error'; reason: Failure } => ({
          status: 'error',
          reason: 'unknown',
        })),
    ])
      .then(([imported, custom]) => {
        if (!current) return;
        setState({
          status: 'ready',
          exercises: [...(custom.status === 'ok' ? custom.value : []), ...curated, ...imported],
          customProblem: custom.status === 'ok' ? null : custom.reason,
        });
      })
      .catch(() => {
        if (current) setState({ status: 'error' });
      });
    return () => {
      current = false;
    };
  }, [service, attempt]);

  // A retry from a working screen refreshes in the background, so the user's search stays put.
  const reload = useCallback(() => {
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    setAttempt((n) => n + 1);
  }, []);

  return { state, reload };
}
