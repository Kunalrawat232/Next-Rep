import { useParams } from 'react-router';
import { Button, Card, ErrorMessage, LoadingMessage, NotFound, PageHeader } from '../../components';
import {
  BODY_PART_LABEL,
  EQUIPMENT_LABEL,
  MUSCLE_LABEL,
  type Exercise,
} from '../../domain/exercises';
import { demoMediaFor } from '../../domain/exercises/demoMedia';
import { useDemoSources } from './demoMap';
import { useExerciseService } from './ExerciseServiceContext';
import { DemoSkeleton, ExerciseDemo } from './ExerciseDemo';
import { useExercises } from './useExercises';

export function ExerciseDetailPage() {
  const { exerciseId } = useParams();
  const { state, reload } = useExercises(useExerciseService());

  if (state.status === 'loading') return <LoadingMessage>Loading exercise…</LoadingMessage>;
  if (state.status === 'error')
    return (
      <div className="flex flex-col items-start gap-4">
        <ErrorMessage>Could not load the exercise. Please try again.</ErrorMessage>
        <Button variant="secondary" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  const exercise = state.exercises.find((e) => e.id === exerciseId);
  if (!exercise)
    return <NotFound title="Exercise not found" to="/exercises" label="Back to exercises" />;
  return <Detail exercise={exercise} />;
}

function Detail({ exercise }: { exercise: Exercise }) {
  const demo = useDemoSources(exercise.id);
  const entry = demo.status === 'ready' ? demo.entry : undefined;
  const photoDir = demo.status === 'ready' ? demo.photoDir : undefined;
  const secondary = entry?.secondary ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back="/exercises" title={exercise.name} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card as="section" aria-label="Details" className="self-start">
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="text-caption font-medium text-ink-muted">Equipment</dt>
              <dd className="text-body font-semibold">{EQUIPMENT_LABEL[exercise.equipmentType]}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium text-ink-muted">Primary muscle</dt>
              <dd className="text-body font-semibold">
                {exercise.muscle
                  ? MUSCLE_LABEL[exercise.muscle]
                  : BODY_PART_LABEL[exercise.bodyPart]}
              </dd>
            </div>
            <div>
              <dt className="text-caption font-medium text-ink-muted">Secondary muscles</dt>
              <dd className="text-body font-semibold">
                {secondary.length > 0
                  ? secondary.map((m) => MUSCLE_LABEL[m]).join(', ')
                  : 'None listed'}
              </dd>
            </div>
          </dl>
        </Card>
        <div className="order-first md:order-last">
          {demo.status === 'loading' ? (
            <DemoSkeleton />
          ) : (
            <ExerciseDemo exerciseName={exercise.name} media={demoMediaFor({ entry, photoDir })} />
          )}
        </div>
      </div>
    </div>
  );
}
