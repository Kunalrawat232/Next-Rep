import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../../domain/exercises';
import { ExercisePicker } from './ExercisePicker';

const exercise = (name: string): Exercise => ({
  id: name,
  name,
  equipmentType: 'barbell',
  bodyPart: 'upper',
  muscle: 'chest',
  aliases: [],
  tier: 'curated',
});

describe('ExercisePicker with onSelect', () => {
  it('makes each row a button that passes the exercise on, so the workout screen can use it', async () => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ExercisePicker
          exercises={[exercise('Bench Press'), exercise('Back Squat')]}
          customProblem={null}
          onRetryCustom={() => undefined}
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /bench press/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ name: 'Bench Press' });
  });

  it('makes the rows plain text when there is nothing to select for', () => {
    render(
      <MemoryRouter>
        <ExercisePicker
          exercises={[exercise('Bench Press')]}
          customProblem={null}
          onRetryCustom={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /bench press/i })).not.toBeInTheDocument();
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
  });
});

describe('ExercisePicker history', () => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n) => `Lift ${n}`);
  const history = names.map((name, i) => ({
    exercise: exercise(name),
    last: new Date(2026, 9, 17 - i, 12).toISOString(),
  }));

  function renderPicker(entries = history, extra: Exercise[] = []) {
    render(
      <MemoryRouter>
        <ExercisePicker
          exercises={[...entries.map((h) => h.exercise), ...extra]}
          customProblem={null}
          onRetryCustom={() => undefined}
          history={entries}
        />
      </MemoryRouter>,
    );
    return userEvent.setup();
  }

  it('shows the exercises done before above the popular ones, most recent first, with when they were last done', () => {
    renderPicker(history, [exercise('Popular lift')]);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf('History')).toBeGreaterThanOrEqual(0);
    expect(headings.indexOf('History')).toBeLessThan(headings.indexOf('Popular exercises'));
    const section = screen.getByRole('region', { name: 'History' });
    const rows = within(section).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Lift A');
    expect(rows[0]).toHaveTextContent(/Last done Sat 17 Oct/);
    expect(rows[1]).toHaveTextContent('Lift B');
  });

  it('shows six, and the rest after Show all', async () => {
    const user = renderPicker();
    const section = screen.getByRole('region', { name: 'History' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(6);
    await user.click(within(section).getByRole('button', { name: 'Show all 8' }));
    expect(within(section).getAllByRole('listitem')).toHaveLength(8);
    await user.click(within(section).getByRole('button', { name: 'Show fewer' }));
    expect(within(section).getAllByRole('listitem')).toHaveLength(6);
  });

  it('has no Show all when there are six or fewer', () => {
    renderPicker(history.slice(0, 6));
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });

  it('is not shown when there is nothing done yet', () => {
    renderPicker([]);
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument();
  });

  it('gives way to the search results while searching', async () => {
    const user = renderPicker();
    await user.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'Lift C');
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.getByText(/\d+ match/)).toBeInTheDocument();
  });
});
