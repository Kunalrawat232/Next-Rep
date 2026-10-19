import { Link } from 'react-router';
import { Button, buttonClasses, LoadingMessage, Section, Switch } from '../../components';
import { summarizeBars } from '../../domain/gyms';
import { useGlassEffect } from '../../lib/useGlassEffect';
import { useAuth } from '../auth';
import { useMyGym } from '../workout';
import { SignOutPanel } from './SignOutPanel';
import { useTheme } from './useTheme';
import { useUnit } from './UnitProvider';

const UNIT_BUTTON = { kg: 'Kg', lb: 'Lb' } as const;

/** Weight unit, your bars, appearance and the account. */
export function SettingsPage() {
  const { state } = useAuth();
  const { unit, setUnit } = useUnit();
  const { theme, setTheme } = useTheme();
  const glass = useGlassEffect();
  const { catalog, reload } = useMyGym();
  if (state.status !== 'signedIn') return null;
  // One loader until your bars have arrived, then the whole page at once.
  if (catalog.status === 'loading') return <LoadingMessage />;

  const gym = catalog.status === 'ready' ? catalog.gym : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-semibold">Settings</h1>

      <Section headingId="units-heading" title="Units">
        <p className="text-callout text-ink-muted">
          Weights are shown and typed in this unit. They are always saved in Kg.
        </p>
        <div role="group" aria-label="Weight unit" className="flex gap-2">
          {(['kg', 'lb'] as const).map((choice) => (
            <Button
              key={choice}
              variant={unit === choice ? 'primary' : 'secondary'}
              aria-pressed={unit === choice}
              className="flex-1"
              onClick={() => setUnit(choice)}
            >
              {UNIT_BUTTON[choice]}
            </Button>
          ))}
        </div>
      </Section>

      <Section headingId="gym-heading" title="Your bars">
        {catalog.status === 'error' && (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-callout">Could not load your gym.</p>
            <button type="button" onClick={reload} className={buttonClasses('secondary')}>
              Try again
            </button>
          </div>
        )}
        {catalog.status === 'ready' && gym && (
          <>
            <p className="text-body font-semibold">{summarizeBars(gym, unit)}</p>
            <p className="text-callout text-ink-muted">
              Added to every weight you log, so the total is counted for you
            </p>
            <Link to="/gym" className={buttonClasses('secondary', 'self-start')}>
              Change bars
            </Link>
          </>
        )}
        {catalog.status === 'ready' && !gym && (
          <>
            <p className="text-callout text-ink-muted">
              Your first workout sets this up with a standard barbell. You can set it now.
            </p>
            <Link to="/gym" className={buttonClasses('primary', 'self-start')}>
              Set up your bars
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
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-body font-semibold">Liquid glass effect</span>
            <span className="text-callout text-ink-muted">
              A glass button that bends the light. Turn it off to save battery
            </span>
          </div>
          <Switch label="Liquid glass effect" checked={glass.enabled} onChange={glass.setEnabled} />
        </div>
      </Section>

      <Link to="/about" className="min-h-touch content-center font-semibold text-accent">
        About and credits
      </Link>

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
