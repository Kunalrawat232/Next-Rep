import { Link } from 'react-router';
import { buttonClasses } from '../../components';
import { pickDefaultGym, summarizeBars } from '../../domain/gyms';
import { BackLink } from './BackLink';
import { useGymService } from './GymServiceContext';
import { GymsLoadError } from './GymsLoadError';
import { useGyms } from './useGyms';

export function GymsPage() {
  const { state, reload } = useGyms(useGymService());
  const defaultId = state.status === 'ready' ? pickDefaultGym(state.gyms)?.id : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BackLink to="/" />
          <h1 className="text-title font-semibold">Gyms</h1>
        </div>
        <Link
          to="/gyms/new"
          className="flex min-h-touch items-center px-2 text-body font-semibold text-accent"
        >
          Add
        </Link>
      </header>

      {state.status === 'loading' && (
        <p role="status" className="text-ink-muted">
          Loading gyms…
        </p>
      )}
      {state.status === 'error' && <GymsLoadError reason={state.reason} onRetry={reload} />}
      {state.status === 'ready' && state.gyms.length === 0 && (
        <section className="flex flex-col items-start gap-4 rounded-md border border-line bg-surface-200 p-4">
          <h2 className="text-headline font-semibold">Add your first gym</h2>
          <p className="text-callout text-ink-muted">
            A gym remembers its bar weights, so the weights you log always include the bar.
          </p>
          <Link to="/gyms/new" className={buttonClasses('primary')}>
            Add a gym
          </Link>
        </section>
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
                  className="flex min-h-touch flex-col gap-1 rounded-md border border-line bg-surface-200 p-4"
                >
                  <span className="flex items-center gap-2 text-body font-semibold">
                    {gym.name}
                    {gym.id === defaultId && (
                      <span className="rounded-full border border-line px-2 text-caption font-medium text-success">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="text-callout text-ink-muted">{summarizeBars(gym)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
