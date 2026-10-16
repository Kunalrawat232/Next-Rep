import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseDemo } from './ExerciseDemo';

const media = {
  gifUrl: 'https://media.example/videos/0001-abc.gif',
  thumbUrl: 'https://media.example/images/0001-abc.jpg',
};

function reducedMotion(on: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: on, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExerciseDemo', () => {
  it('shows the animation with a description, lazily, behind a skeleton until it loads', () => {
    render(<ExerciseDemo exerciseName="Barbell Curl" media={media} />);
    const img = screen.getByRole('img', { name: 'Demonstration of Barbell Curl' });
    expect(img).toHaveAttribute('src', media.gifUrl);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByTestId('demo-skeleton')).toBeInTheDocument();
    fireEvent.load(img);
    expect(screen.queryByTestId('demo-skeleton')).not.toBeInTheDocument();
    expect(img).toBeVisible();
  });

  it('falls back to a placeholder, with no broken image, when the picture fails', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ExerciseDemo exerciseName="Barbell Curl" media={media} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Demonstration unavailable')).toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
  });

  it('shows a placeholder when the exercise has no demonstration', () => {
    render(<ExerciseDemo exerciseName="My own lift" media={null} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('No demonstration for this exercise')).toBeInTheDocument();
  });

  it('does not ask for the picture offline, and says why', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<ExerciseDemo exerciseName="Barbell Curl" media={media} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/need an internet connection/i)).toBeInTheDocument();
  });

  it('shows the still thumbnail instead of the animation under "reduce motion"', () => {
    reducedMotion(true);
    render(<ExerciseDemo exerciseName="Barbell Curl" media={media} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', media.thumbUrl);
  });

  it('shows the animation when motion is allowed', () => {
    reducedMotion(false);
    render(<ExerciseDemo exerciseName="Barbell Curl" media={media} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', media.gifUrl);
  });

  it('starts over with a new exercise: skeleton again, and a failure is forgotten', () => {
    const { rerender } = render(<ExerciseDemo exerciseName="One" media={media} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Demonstration unavailable')).toBeInTheDocument();
    rerender(
      <ExerciseDemo
        exerciseName="Two"
        media={{
          gifUrl: 'https://media.example/videos/2.gif',
          thumbUrl: 'https://media.example/images/2.jpg',
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Demonstration of Two' })).toBeInTheDocument();
    expect(screen.getByTestId('demo-skeleton')).toBeInTheDocument();
  });

  it('keeps the same square in every state, so the page never jumps', () => {
    const squares = (view: ReturnType<typeof render>) =>
      view.container.querySelectorAll('.aspect-square').length;
    const loading = render(<ExerciseDemo exerciseName="A" media={media} />);
    expect(squares(loading)).toBe(1);
    fireEvent.load(loading.getByRole('img'));
    expect(squares(loading)).toBe(1);
    fireEvent.error(loading.getByRole('img'));
    expect(squares(loading)).toBe(1);
    expect(squares(render(<ExerciseDemo exerciseName="B" media={null} />))).toBe(1);
  });
});
