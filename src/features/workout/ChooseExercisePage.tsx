import { Link, useNavigate } from 'react-router';
import { Button, ErrorMessage, LoadingMessage } from '../../components';
import { ExercisePicker, useExerciseHistory, useExerciseService, useExercises } from '../exercises';

const NONE: never[] = [];

/** Picks the exercise for the workout, and goes back to it. */
export function ChooseExercisePage() {
  const navigate = useNavigate();
  const { state, reload } = useExercises(useExerciseService());
  const history = useExerciseHistory(state.status === 'ready' ? state.exercises : NONE);

  // One loader until the exercise list (including your own, from the server) has settled.
  if (state.status === 'loading' || history === null)
    return <LoadingMessage>Loading exercises…</LoadingMessage>;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-title font-semibold">Choose exercise</h1>
        <Link
          to="/workout"
          aria-label="Close"
          className="flex size-touch items-center justify-center text-ink"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      </header>
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
          onSelect={(exercise) => navigate(`/workout?exercise=${exercise.id}`)}
          history={history}
        />
      )}
    </div>
  );
}
