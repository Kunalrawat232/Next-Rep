import { Link } from 'react-router';
import { buttonClasses, Chip, Section, Switch } from '../../components';
import { DEMO_MEDIA, PHOTO_MEDIA } from '../../domain/exercises/demoMedia';
import { pickDefaultGym } from '../../domain/gyms';
import { withUnit } from '../../domain/units';
import { useAuth } from '../auth';
import { useGymCatalog } from '../workout';
import { SignOutPanel } from './SignOutPanel';
import { useTheme } from './useTheme';
import { useUnit } from './UnitProvider';

/** Weight unit, default gym, appearance and the account. */
export function SettingsPage() {
  const { state } = useAuth();
  const { unit, setUnit } = useUnit();
  const { theme, setTheme } = useTheme();
  const { catalog, reload } = useGymCatalog();
  if (state.status !== 'signedIn') return null;

  const gym = catalog.status === 'ready' ? pickDefaultGym(catalog.gyms) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-semibold">Settings</h1>

      <Section headingId="units-heading" title="Units">
        <p className="text-callout text-ink-muted">
          Weights are shown and typed in this unit. They are always saved in kg.
        </p>
        <div role="group" aria-label="Weight unit" className="flex gap-2">
          <Chip selected={unit === 'kg'} onClick={() => setUnit('kg')}>
            kg
          </Chip>
          <Chip selected={unit === 'lb'} onClick={() => setUnit('lb')}>
            lb
          </Chip>
        </div>
      </Section>

      <Section headingId="gym-heading" title="Default gym">
        {catalog.status === 'loading' && (
          <p role="status" className="text-callout text-ink-muted">
            Loading…
          </p>
        )}
        {catalog.status === 'error' && (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-callout">Could not load your gyms.</p>
            <button type="button" onClick={reload} className={buttonClasses('secondary')}>
              Try again
            </button>
          </div>
        )}
        {catalog.status === 'ready' && gym && (
          <>
            <p className="text-body font-semibold">{gym.name}</p>
            <p className="text-callout text-ink-muted">
              {withUnit(gym.barbellKg, unit)} barbell, used when you start a workout
            </p>
            <Link to="/gyms" className={buttonClasses('secondary', 'self-start')}>
              Manage gyms
            </Link>
          </>
        )}
        {catalog.status === 'ready' && !gym && (
          <>
            <p className="text-callout text-ink-muted">
              You have no gym yet. Add one so every weight adds up with the right bar.
            </p>
            <Link to="/gyms/new" className={buttonClasses('primary', 'self-start')}>
              Add a gym
            </Link>
          </>
        )}
      </Section>

      <Section headingId="appearance-heading" title="Appearance">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-body font-semibold">Light mode</span>
            <span className="text-callout text-ink-muted">Dark is the default during workouts</span>
          </div>
          <Switch
            label="Light mode"
            checked={theme === 'light'}
            onChange={(on) => setTheme(on ? 'light' : 'dark')}
          />
        </div>
      </Section>

      <Section headingId="credits-heading" title="About and credits">
        <p className="text-callout text-ink-muted">{DEMO_MEDIA.credit.note}</p>
        <p className="text-callout">
          Exercise demonstrations ©{' '}
          <a
            href={DEMO_MEDIA.credit.ownerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent"
          >
            {DEMO_MEDIA.credit.owner}
          </a>
          . Exercise data from{' '}
          <a
            href={DEMO_MEDIA.credit.datasetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent"
          >
            {DEMO_MEDIA.credit.dataset}
          </a>{' '}
          (MIT licence). {PHOTO_MEDIA.credit.note} See{' '}
          <a
            href={PHOTO_MEDIA.credit.datasetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent"
          >
            {PHOTO_MEDIA.credit.dataset}
          </a>
          .
        </p>
      </Section>

      <Section headingId="account-heading" title="Account">
        <div className="flex flex-col">
          <span className="text-body font-semibold">{state.user.email ?? 'Your account'}</span>
          <span className="text-callout text-ink-muted">Signed in</span>
        </div>
        <SignOutPanel />
      </Section>
    </div>
  );
}
