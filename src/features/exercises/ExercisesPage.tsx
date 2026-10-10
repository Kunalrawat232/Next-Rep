import { Link } from 'react-router';
import { Button, ErrorMessage, LoadingMessage, PageHeader } from '../../components';
import { useExerciseService } from './ExerciseServiceContext';
import { ExercisePicker } from './ExercisePicker';
import { useExercises } from './useExercises';

export function ExercisesPage() {
  const { state, reload } = useExercises(useExerciseService());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back="/"
        title="Exercises"
        actions={
          <Link
            to="/exercises/new"
            className="flex min-h-touch items-center px-2 text-body font-semibold text-accent"
          >
            Add
          </Link>
        }
      />

      {state.status === 'loading' && <LoadingMessage>Loading exercises…</LoadingMessage>}
      {state.status === 'error' && (
        <div className="flex flex-col items-start gap-4">
          <ErrorMessage>Could not load the exercises. Please try again.</ErrorMessage>
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
