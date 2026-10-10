import { Link } from 'react-router';
import {
  buttonClasses,
  cardClasses,
  EmptyState,
  LoadingMessage,
  PageHeader,
} from '../../components';
import { pickDefaultGym, summarizeBars } from '../../domain/gyms';
import { useGymService } from './GymServiceContext';
import { GymsLoadError } from './GymsLoadError';
import { useGyms } from './useGyms';
import { useUnit } from '../settings/UnitProvider';

export function GymsPage() {
  const { unit } = useUnit();
  const { state, reload } = useGyms(useGymService());
  const defaultId = state.status === 'ready' ? pickDefaultGym(state.gyms)?.id : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back="/"
        title="Gyms"
        actions={
          <Link
            to="/gyms/new"
            className="flex min-h-touch items-center px-2 text-body font-semibold text-accent"
          >
            Add
          </Link>
        }
      />

      {state.status === 'loading' && <LoadingMessage>Loading gyms…</LoadingMessage>}
      {state.status === 'error' && <GymsLoadError reason={state.reason} onRetry={reload} />}
      {state.status === 'ready' && state.gyms.length === 0 && (
        <EmptyState
          title="Add your first gym"
          message="A gym remembers its bar weights, so the weights you log always include the bar."
        >
          <Link to="/gyms/new" className={buttonClasses('primary')}>
            Add a gym
          </Link>
        </EmptyState>
      )}
      {state.status === 'ready' && state.gyms.length > 0 && (
        <>
          <p className="text-callout text-ink-muted">
            Each gym remembers its bars. Weights you log always include the bar.
          </p>
          <ul className="flex flex-col gap-2">
            {state.gyms.map((gym) => (
              <li key={gym.id}>
                <Link
                  to={`/gyms/${gym.id}`}
                  className={cardClasses('flex min-h-touch flex-col gap-1')}
                >
                  <span className="flex items-center gap-2 text-body font-semibold">
                    {gym.name}
                    {gym.id === defaultId && (
                      <span className="rounded-full border border-line px-2 text-caption font-medium text-success">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="text-callout text-ink-muted">{summarizeBars(gym, unit)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
