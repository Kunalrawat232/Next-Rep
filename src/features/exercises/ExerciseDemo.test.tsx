import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseDemo } from './ExerciseDemo';

const media = {
  kind: 'gif' as const,
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
          kind: 'gif',
          gifUrl: 'https://media.example/videos/2.gif',
          thumbUrl: 'https://media.example/images/2.jpg',
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Demonstration of Two' })).toBeInTheDocument();
    expect(screen.getByTestId('demo-skeleton')).toBeInTheDocument();
  });

  it('never stretches the 180 px animation beyond its own size', () => {
    render(<ExerciseDemo exerciseName="A" media={media} />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('size-[180px]');
    expect(img).toHaveAttribute('width', '180');
  });

  it('keeps the same box in every state, so the page never jumps', () => {
    const boxes = (view: ReturnType<typeof render>) =>
      view.container.querySelectorAll('.aspect-\\[3\\/2\\]').length;
    const loading = render(<ExerciseDemo exerciseName="A" media={media} />);
    expect(boxes(loading)).toBe(1);
    fireEvent.load(loading.getByRole('img'));
    expect(boxes(loading)).toBe(1);
    fireEvent.error(loading.getByRole('img'));
    expect(boxes(loading)).toBe(1);
    expect(boxes(render(<ExerciseDemo exerciseName="B" media={null} />))).toBe(1);
    expect(boxes(render(<ExerciseDemo exerciseName="C" media={photos} />))).toBe(1);
  });
});

const photos = {
  kind: 'photos' as const,
  startUrl: 'https://media.example/Squat/0.jpg',
  endUrl: 'https://media.example/Squat/1.jpg',
};

describe('ExerciseDemo with photos', () => {
  it('shows the start pose with the description, and fades the end pose over it once loaded', () => {
    render(<ExerciseDemo exerciseName="Barbell Squat" media={photos} />);
    const start = screen.getByRole('img', { name: 'Demonstration of Barbell Squat' });
    expect(start).toHaveAttribute('src', photos.startUrl);
    expect(screen.queryByTestId('demo-end-pose')).not.toBeInTheDocument();
    expect(screen.getByTestId('demo-skeleton')).toBeInTheDocument();
    fireEvent.load(start);
    const end = screen.getByTestId('demo-end-pose');
    expect(end).toHaveAttribute('src', photos.endUrl);
    expect(end).toHaveAttribute('aria-hidden', 'true');
    expect(end).toHaveAttribute('alt', '');
    expect(end.className).toContain('demo-fade');
    expect(screen.queryByTestId('demo-skeleton')).not.toBeInTheDocument();
    // One described picture, not two.
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('shows only the start pose, still, under "reduce motion"', () => {
    reducedMotion(true);
    render(<ExerciseDemo exerciseName="Barbell Squat" media={photos} />);
    fireEvent.load(screen.getByRole('img'));
    expect(screen.queryByTestId('demo-end-pose')).not.toBeInTheDocument();
  });

  it('keeps the start pose when only the end photo fails', () => {
    render(<ExerciseDemo exerciseName="Barbell Squat" media={photos} />);
    fireEvent.load(screen.getByRole('img'));
    fireEvent.error(screen.getByTestId('demo-end-pose'));
    expect(screen.queryByTestId('demo-end-pose')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', photos.startUrl);
  });

  it('shows the placeholder when the start photo fails', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ExerciseDemo exerciseName="Barbell Squat" media={photos} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Demonstration unavailable')).toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
  });

  it('does not ask for photos offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<ExerciseDemo exerciseName="Barbell Squat" media={photos} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/need an internet connection/i)).toBeInTheDocument();
  });
});
