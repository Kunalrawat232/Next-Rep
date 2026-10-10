import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, Card, Chip, ErrorMessage, Section, Switch } from '.';

function Controlled({
  start = false,
  onChange,
}: {
  start?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const [on, setOn] = useState(start);
  return (
    <Switch
      label="Light mode"
      checked={on}
      onChange={(v) => {
        onChange?.(v);
        setOn(v);
      }}
    />
  );
}

describe('QA Switch', () => {
  it('is a named switch that reports the new value, and flips back on the next tap', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Light mode' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await user.click(toggle);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it.each([['{Enter}'], [' ']])('works from the keyboard (%j) once focused', async (key) => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await user.keyboard(key);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('asks for the opposite of what it shows, not of what was last asked (a controlled parent can refuse)', () => {
    const onChange = vi.fn();
    render(<Switch label="x" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange.mock.calls).toEqual([[true], [true]]);
  });

  it('keeps the drawn track out of the accessibility tree and the button at touch size', () => {
    render(<Switch label="x" checked onChange={() => undefined} />);
    const toggle = screen.getByRole('switch');
    expect(toggle.className).toMatch(/min-h-touch/);
    expect(toggle.className).toMatch(/min-w-touch/);
    expect(toggle.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(toggle).toHaveAccessibleName('x');
  });
});

describe('QA Chip', () => {
  it('is a toggle with aria-pressed that follows `selected`', () => {
    const { rerender } = render(<Chip selected={false}>kg</Chip>);
    expect(screen.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'false');
    rerender(<Chip selected>kg</Chip>);
    expect(screen.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not submit a form, and does not fire while disabled', async () => {
    const submit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <form onSubmit={submit}>
        <Chip selected={false} onClick={onClick}>
          a
        </Chip>
        <Chip selected={false} onClick={onClick} disabled>
          b
        </Chip>
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'a' }));
    await user.click(screen.getByRole('button', { name: 'b' }));
    expect(submit).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is 48 px tall at least, selected or not', () => {
    render(
      <>
        <Chip selected>on</Chip>
        <Chip selected={false}>off</Chip>
      </>,
    );
    for (const b of screen.getAllByRole('button')) expect(b.className).toMatch(/min-h-touch/);
  });
});

describe('QA Section, Card and messages', () => {
  it('names a section by its heading, and two sections get two regions', () => {
    render(
      <>
        <Section headingId="a" title="Units">
          x
        </Section>
        <Section headingId="b" title="Account">
          y
        </Section>
      </>,
    );
    expect(screen.getByRole('region', { name: 'Units' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
  });

  it('a plain Card is not a landmark, a section Card without a name is not a region', () => {
    render(
      <>
        <Card>a</Card>
        <Card as="section">b</Card>
      </>,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it.each(['normal', 'danger', 'warning', 'success', 'accent'] as const)(
    'a %s card has exactly one border colour',
    (tone) => {
      render(<Card tone={tone}>t</Card>);
      const classes = screen.getByText('t').className.split(' ');
      expect(
        classes.filter((c) => /^border-(line|danger|warning|success|accent)$/.test(c)),
      ).toHaveLength(1);
    },
  );

  it('ErrorMessage with a retry has one alert and one Try again, and calls back once per tap', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorMessage onRetry={onRetry}>Nope</ErrorMessage>);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a Button inside a form submits only when it asks to', () => {
    const submit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <Button>plain</Button>
        <Button type="submit">send</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'plain' }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
