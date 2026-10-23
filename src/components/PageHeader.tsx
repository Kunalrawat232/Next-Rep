import type { ReactNode } from 'react';
import { BackLink } from './BackLink';

/** A page's title with a way back, and optionally an action at the far end (such as "Add"). */
export function PageHeader({
  title,
  back,
  actions,
}: {
  title: ReactNode;
  back: string;
  actions?: ReactNode;
}) {
  const left = (
    <>
      <BackLink to={back} />
      <h1 className="text-title font-semibold">{title}</h1>
    </>
  );
  if (!actions) return <header className="flex items-center gap-2">{left}</header>;
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">{left}</div>
      {actions}
    </header>
  );
}
