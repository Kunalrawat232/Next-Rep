import { render, screen } from '@testing-library/react';
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
