// QA pass: the set list on its own, with odd sets and either unit.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredSet } from '../../data/local';
import type { Unit } from '../../domain/schemas';
import { aSet, uuid } from '../../test/localDb';
import { SetList } from './SetList';

let unit: Unit = 'kg';
vi.mock('../settings/UnitProvider', () => ({ useUnit: () => ({ unit, setUnit: () => {} }) }));

const stored = (over: Partial<StoredSet> = {}): StoredSet =>
  ({
    ...aSet(uuid()),
    syncStatus: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    rev: 1,
    everSynced: false,
    ...over,
  }) as StoredSet;

beforeEach(() => {
  unit = 'kg';
});

describe('SetList', () => {
  it('is a labelled region with an ordered list numbered from 1', () => {
    render(<SetList title="Bench" sets={[stored(), stored(), stored()]} />);
    const region = screen.getByRole('region', { name: 'Bench' });
    const items = within(region).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.firstElementChild?.textContent)).toEqual(['1', '2', '3']);
    expect(within(region).getByRole('heading', { name: 'Bench', level: 2 })).toBeInTheDocument();
  });

  it('shows the empty text, and no list, for no sets', () => {
    render(<SetList title="Bench" sets={[]} empty="No sets yet." />);
    expect(screen.getByText('No sets yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders nothing odd for no sets and no empty text', () => {
    render(<SetList title="Bench" sets={[]} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bench' })).not.toHaveTextContent('undefined');
  });

  it.each<[Unit, Partial<StoredSet>, string, string | null]>([
    [
      'kg',
      { totalKg: 60, reps: 8, barKg: 20, perSideKg: 20 },
      '60 kg × 8',
      '20 kg bar + 20 kg each side',
    ],
    ['kg', { totalKg: 61.23, reps: 1, barKg: null, perSideKg: null }, '61.23 kg × 1', null],
    ['kg', { totalKg: 0, reps: 20, barKg: null, perSideKg: null }, '0 kg × 20', null],
    [
      'kg',
      { totalKg: 500, reps: 100, barKg: 20, perSideKg: 240 },
      '500 kg × 100',
      '20 kg bar + 240 kg each side',
    ],
    ['lb', { totalKg: 60, reps: 8, barKg: null, perSideKg: null }, '132.3 lb × 8', null],
  ])('shows %s: %j as %j with detail %j', (u, over, headline, detail) => {
    unit = u;
    render(<SetList title="X" sets={[stored(over)]} />);
    expect(screen.getByText(headline)).toBeInTheDocument();
    if (detail) expect(screen.getByText(detail)).toBeInTheDocument();
    else expect(screen.getByRole('listitem').querySelectorAll('span span')).toHaveLength(1);
  });

  it('marks only the sets that are records, with an accessible name', () => {
    const a = stored();
    const b = stored();
    render(<SetList title="X" sets={[a, b]} marks={new Map([[b.id, 'weight' as const]])} />);
    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first!).queryByRole('img')).not.toBeInTheDocument();
    expect(within(second!).getByRole('img', { name: /heaviest weight/ })).toBeInTheDocument();
  });

  it('keeps duplicate-looking sets as separate rows and uses ids as keys', () => {
    const same = { totalKg: 60, reps: 8, loggedAt: '2026-10-10T10:00:00.000Z' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<SetList title="X" sets={[stored(same), stored(same)]} />);
    expect(screen.getAllByText('60 kg × 8')).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('renders a few hundred sets', () => {
    const sets = Array.from({ length: 300 }, () => stored());
    render(<SetList title="X" sets={sets} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(300);
  });

  it('shows a title with markup as text', () => {
    render(<SetList title={'<img src=x onerror=alert(1)>'} sets={[]} empty="none" />);
    expect(document.querySelector('img')).toBeNull();
  });

  // BUG (low, needs a stored total below its bar): src/domain/workout/index.ts:116 the detail line reads "+ -5 kg plates" instead of hiding or explaining.
  it('never shows a negative plate weight', () => {
    render(
      <SetList title="X" sets={[stored({ totalKg: 15, barKg: 20, perSideKg: null, reps: 5 })]} />,
    );
    expect(screen.getByRole('listitem').textContent).not.toMatch(/-\d/);
  });
});
