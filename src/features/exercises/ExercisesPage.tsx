import { Link } from 'react-router';
import { BackLink, Button } from '../../components';
import { useExerciseService } from './ExerciseServiceContext';
import { ExercisePicker } from './ExercisePicker';
import { useExercises } from './useExercises';

export function ExercisesPage() {
  const { state, reload } = useExercises(useExerciseService());

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BackLink to="/" />
          <h1 className="text-title font-semibold">Exercises</h1>
        </div>
        <Link
          to="/exercises/new"
          className="flex min-h-touch items-center px-2 text-body font-semibold text-accent"
        >
          Add
        </Link>
      </header>

      {state.status === 'loading' && (
        <p role="status" className="text-ink-muted">
          Loading exercises…
        </p>
      )}
      {state.status === 'error' && (
        <div className="flex flex-col items-start gap-4">
          <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
            Could not load the exercises. Please try again.
          </p>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </div>
      )}
      {state.status === 'ready' && (
        <ExercisePicker
          exercises={state.exercises}
          customProblem={state.customProblem}
          onRetryCustom={reload}
        />
      )}
    </div>
  );
}
