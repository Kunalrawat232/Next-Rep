import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useGlassEffect, useLiquidGlass } from '../lib/useGlassEffect';
import { Logo } from './Logo';

type Item = { label: string; to: string; icon: ReactNode; desktopOnly?: boolean };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ITEMS: Item[] = [
  {
    label: 'Home',
    to: '/',
    icon: (
      <Icon>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </Icon>
    ),
  },
  {
    label: 'Workout',
    to: '/workout',
    desktopOnly: true,
    icon: (
      <Icon>
        <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
      </Icon>
    ),
  },
  {
    label: 'History',
    to: '/history',
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </Icon>
    ),
  },
  {
    label: 'Progress',
    to: '/progress',
    icon: (
      <Icon>
        <path d="M4 20V4" />
        <path d="M4 20h16" />
        <path d="M8 15l4-4 3 3 5-6" />
      </Icon>
    ),
  },
  {
    label: 'Settings',
    to: '/settings',
    icon: (
      <Icon>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </Icon>
    ),
  },
];

const itemBase =
  'flex min-h-touch flex-1 flex-col items-center justify-center gap-1 text-caption lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:rounded-md lg:px-3 lg:text-body';

/** Bottom tab bar on phones, sidebar from 1024 px up. One nav element, laid out by CSS. */
export function AppShell() {
  const { enabled } = useGlassEffect();
  useLiquidGlass(enabled);
  return (
    <div className="relative isolate min-h-dvh lg:flex">
      {/* The colour behind the app, for the glass to show. Decoration only. */}
      <div id="ambient" aria-hidden="true" className="fixed inset-0 -z-10" />
      <div className="glass fixed inset-x-0 bottom-0 z-10 border-t border-glass-line pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:pl-6 lg:pr-6 lg:static lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-t-0 lg:border-r lg:p-6 lg:pb-6">
        <div className="hidden px-2 lg:block">
          <Logo width={150} />
        </div>
        <nav aria-label="Main">
          <ul className="flex px-2 pt-2 lg:flex-col lg:gap-1 lg:p-0">
            {ITEMS.map((item) => (
              <li
                key={item.label}
                className={item.desktopOnly ? 'hidden lg:block' : 'flex flex-1 lg:block'}
              >
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `${itemBase} ${isActive ? 'text-accent lg:bg-surface-200' : 'text-ink-muted'}`
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {/* The phone's Workout entry: the sidebar item is desktop-only. */}
      <Link
        to="/workout"
        aria-label="Workout"
        className="liquidGL glass fixed right-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-10 flex size-16 items-center justify-center rounded-full border border-glass-line text-accent lg:hidden"
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
        </svg>
      </Link>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-28 lg:px-8 lg:pb-8">
        <Outlet />
      </main>
    </div>
  );
}
