import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  Card,
  cardClasses,
  EmptyState,
  ErrorMessage,
  LoadingMessage,
  NotFound,
  PageHeader,
  RetryMessage,
  Section,
} from '.';

const inRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Card', () => {
  it('has the box look, and takes layout classes', () => {
    render(<Card className="flex flex-col gap-3">inside</Card>);
    const box = screen.getByText('inside');
    expect(box).toHaveClass(
      'rounded-md',
      'border',
      'border-line',
      'bg-surface-200',
      'p-4',
      'flex',
      'gap-3',
    );
    expect(box.tagName).toBe('DIV');
  });

  it('can be a section, and passes attributes on', () => {
    render(
      <Card as="section" aria-label="Account">
        inside
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Account' }).tagName).toBe('SECTION');
  });

  it('has a red border in the danger tone, and not the normal one', () => {
    render(<Card tone="danger">inside</Card>);
    const box = screen.getByText('inside');
    expect(box).toHaveClass('border-danger');
    expect(box).not.toHaveClass('border-line');
  });

  it.each(['warning', 'success', 'accent'] as const)(
    'has a %s border in that tone only',
    (tone) => {
      render(<Card tone={tone}>inside</Card>);
      const box = screen.getByText('inside');
      expect(box).toHaveClass(`border-${tone}`);
      expect(box).not.toHaveClass('border-line');
    },
  );

  it('gives the same classes as a function, for links and list items', () => {
    expect(cardClasses()).toBe('rounded-md border border-line bg-surface-200 p-4');
    expect(cardClasses('flex gap-2')).toBe(
      'rounded-md border border-line bg-surface-200 p-4 flex gap-2',
    );
    expect(cardClasses('', 'danger')).toContain('border-danger');
  });
});

describe('LoadingMessage', () => {
  it('is a status that says Loading…, or what it is given', () => {
    render(
      <>
        <LoadingMessage />
        <LoadingMessage>Loading your history…</LoadingMessage>
      </>,
    );
    const [first, second] = screen.getAllByRole('status');
    expect(first).toHaveTextContent('Loading…');
    expect(second).toHaveTextContent('Loading your history…');
  });
});

describe('ErrorMessage', () => {
  it('is announced, in a red box', () => {
    render(<ErrorMessage>Something went wrong.</ErrorMessage>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong.');
    expect(alert).toHaveClass('border-danger');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has a Try again button inside the box when it can retry', async () => {
    const retry = vi.fn();
    render(<ErrorMessage onRetry={retry}>Could not read.</ErrorMessage>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-danger');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('RetryMessage', () => {
  it('is announced, not boxed, with a Try again button', async () => {
    const retry = vi.fn();
    render(<RetryMessage onRetry={retry}>Could not read.</RetryMessage>);
    const alert = screen.getByRole('alert');
    expect(alert).not.toHaveClass('border-danger');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState', () => {
  it('has a heading, a line of explanation and the ways forward, and no landmark of its own', () => {
    inRouter(
      <EmptyState title="Nothing yet" message="Do something.">
        <a href="/x">Do it</a>
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { name: 'Nothing yet', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Do something.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Do it' })).toBeInTheDocument();
    // An unlabelled section is not a region, so a page's own regions are not joined by a stray one.
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('works without any actions', () => {
    render(<EmptyState title="Empty" message="Nothing here." />);
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });
});

describe('NotFound', () => {
  it('has a title, an optional message and a way back', () => {
    inRouter(
      <NotFound title="Gym not found" message="It may be gone." to="/gyms" label="Back to gyms" />,
    );
    expect(screen.getByRole('heading', { name: 'Gym not found', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('It may be gone.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to gyms' })).toHaveAttribute('href', '/gyms');
  });

  it('leaves out the message when there is none', () => {
    inRouter(<NotFound title="Not found" to="/" label="Home" />);
    expect(screen.queryByText(/./, { selector: 'p' })).not.toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('has a back link and the page title', () => {
    inRouter(<PageHeader back="/history" title="History" />);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('heading', { name: 'History', level: 1 })).toBeInTheDocument();
  });

  it('puts an action at the far end', () => {
    inRouter(<PageHeader back="/" title="Gyms" actions={<a href="/gyms/new">Add</a>} />);
    expect(screen.getByRole('link', { name: 'Add' })).toHaveAttribute('href', '/gyms/new');
    const header = screen.getByRole('heading', { name: 'Gyms' }).closest('header')!;
    expect(within(header).getByRole('link', { name: 'Add' })).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Back' })).toBeInTheDocument();
  });
});

describe('Section', () => {
  it('is a region named by its heading', () => {
    render(
      <Section headingId="units-heading" title="Units">
        content
      </Section>,
    );
    const region = screen.getByRole('region', { name: 'Units' });
    expect(within(region).getByRole('heading', { name: 'Units', level: 2 })).toHaveAttribute(
      'id',
      'units-heading',
    );
    expect(region).toHaveTextContent('content');
  });
});
