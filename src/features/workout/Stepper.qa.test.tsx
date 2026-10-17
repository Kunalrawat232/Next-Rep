// QA pass: accessibility and behaviour of the Stepper on its own.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from './Stepper';

function setup(over: Partial<Parameters<typeof Stepper>[0]> = {}) {
  const onChange = vi.fn();
  const onStep = vi.fn();
  render(<Stepper label="Reps" value="8" onChange={onChange} onStep={onStep} {...over} />);
  return { onChange, onStep, user: userEvent.setup() };
}

describe('Stepper accessibility', () => {
  it('names the field by its label and the buttons by label and direction', () => {
    setup({ label: 'Weight per side' });
    expect(screen.getByRole('textbox', { name: 'Weight per side' })).toHaveValue('8');
    expect(screen.getByRole('button', { name: 'Decrease weight per side' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Increase weight per side' })).toBeInTheDocument();
  });

  it('gives two steppers with the same label different ids, so each label points at its own field', () => {
    render(
      <>
        <Stepper label="Reps" value="1" onChange={() => {}} onStep={() => {}} />
        <Stepper label="Reps" value="2" onChange={() => {}} onStep={() => {}} />
      </>,
    );
    const fields = screen.getAllByRole('textbox');
    expect(fields[0]!.id).not.toBe(fields[1]!.id);
    expect(screen.getAllByLabelText('Reps')).toHaveLength(2);
  });

  it('has no error wiring when there is no error', () => {
    setup();
    const field = screen.getByRole('textbox');
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(field).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  it('points the field at its error text and marks it invalid', () => {
    setup({ error: 'Reps must be a whole number.' });
    const field = screen.getByRole('textbox');
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription('Reps must be a whole number.');
  });

  it('treats an empty error string as no error', () => {
    setup({ error: '' });
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
  });

  it('keeps the unit out of the field name', () => {
    setup({ label: 'Weight', unit: 'lb' });
    expect(screen.getByRole('textbox', { name: 'Weight' })).toBeInTheDocument();
    expect(screen.getByText('Lb')).toBeInTheDocument();
  });

  it('puts the buttons in tab order before and after the field, and hides the icons from readers', () => {
    setup();
    const [minus, plus] = [
      screen.getByRole('button', { name: /decrease/i }),
      screen.getByRole('button', { name: /increase/i }),
    ];
    const field = screen.getByRole('textbox');
    expect(minus.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.compareDocumentPosition(plus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0);
  });
});

describe('Stepper behaviour', () => {
  it('steps down and up by one direction each, and never changes the text itself', async () => {
    const { user, onStep, onChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Decrease reps' }));
    await user.click(screen.getByRole('button', { name: 'Increase reps' }));
    expect(onStep.mock.calls).toEqual([[-1], [1]]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hands over what was typed as it is, without cleaning it', async () => {
    const { user, onChange } = setup({ value: '' });
    await user.type(screen.getByRole('textbox'), '1,5');
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['1', ',', '5']);
  });

  it('does not submit a surrounding form when a step button is pressed', async () => {
    const submit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <Stepper label="Reps" value="8" onChange={() => {}} onStep={() => {}} />
      </form>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Increase reps' }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('can be used from the keyboard with Enter and Space', async () => {
    const { user, onStep } = setup();
    screen.getByRole('button', { name: 'Increase reps' }).focus();
    await user.keyboard('{Enter} ');
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it('uses a numeric keypad hint for reps and a decimal one for weight', () => {
    setup({ inputMode: 'numeric' });
    expect(screen.getByRole('textbox')).toHaveAttribute('inputmode', 'numeric');
  });

  it('defaults to the decimal keypad and turns autocomplete off', () => {
    setup();
    expect(screen.getByRole('textbox')).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByRole('textbox')).toHaveAttribute('autocomplete', 'off');
  });

  // BUG (low): src/features/workout/Stepper.tsx:46 the button name lowercases only the first letter, so an acronym label becomes "Decrease rPE".
  it('keeps an acronym label readable in the button names', () => {
    setup({ label: 'RPE' });
    expect(screen.getByRole('button', { name: 'Decrease RPE' })).toBeInTheDocument();
  });
});
