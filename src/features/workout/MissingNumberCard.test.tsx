import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../../domain/exercises';
import type { PartialDraft } from '../voice';
import { MissingNumberCard } from './MissingNumberCard';

const BENCH: Exercise = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Bench Press',
  equipmentType: 'barbell',
  bodyPart: 'upper',
  muscle: null,
  aliases: [],
  tier: 'curated',
};
const askReps: PartialDraft = {
  kind: 'partial',
  missing: 'reps',
  exercise: BENCH,
  weight: { value: 20, unit: 'kg', mode: 'per_side' },
};
const askWeight: PartialDraft = { kind: 'partial', missing: 'weight', exercise: BENCH, reps: 1 };

function setup(draft: PartialDraft, unit: 'kg' | 'lb' = 'kg', lastTotalKg?: number) {
  const onReps = vi.fn();
  const onWeight = vi.fn();
  const onCancel = vi.fn();
  render(
    <MissingNumberCard
      transcript="bench press"
      draft={draft}
      unit={unit}
      lastTotalKg={lastTotalKg}
      onReps={onReps}
      onWeight={onWeight}
      onCancel={onCancel}
    />,
  );
  return { onReps, onWeight, onCancel, user: userEvent.setup() };
}

describe('MissingNumberCard', () => {
  it('shows the weight as said, with per side, and gives the rep count of a quick button', async () => {
    const { onReps, user } = setup(askReps);
    expect(screen.getByText(/bench press · 20 kg per side/i)).toBeInTheDocument();
    for (const count of ['5', '6', '8', '10', '12'])
      expect(screen.getByRole('button', { name: count })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '10' }));
    expect(onReps).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('says one rep in the singular and asks in the unit the person uses', async () => {
    const { onWeight, user } = setup(askWeight, 'lb', 60);
    expect(screen.getByText(/bench press · 1 rep$/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Weight (Lb)' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /weight/i }), '135');
    await user.click(screen.getByRole('button', { name: 'Use' }));
    expect(onWeight).toHaveBeenCalledExactlyOnceWith({
      value: 135,
      unit: 'lb',
      mode: 'unspecified',
    });
  });

  it('gives the last total in kg as a total when "same as last time" is tapped', async () => {
    const { onWeight, user } = setup(askWeight, 'lb', 60);
    await user.click(screen.getByRole('button', { name: /same as last time \(132\.3 lb\)/i }));
    expect(onWeight).toHaveBeenCalledExactlyOnceWith({ value: 60, unit: 'kg', mode: 'total' });
  });

  it('submits a typed number with Enter, and cancels', async () => {
    const { onReps, onCancel, user } = setup(askReps);
    await user.type(screen.getByRole('textbox', { name: 'Reps' }), '9{Enter}');
    expect(onReps).toHaveBeenCalledExactlyOnceWith(9);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
