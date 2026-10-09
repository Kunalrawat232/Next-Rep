import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { createFakeExerciseService, customExercise } from '../../test/fakeExercises';
import { AuthProvider } from '../auth';
import { CustomExercisePage } from './CustomExercisePage';
import { ExerciseServiceProvider } from './ExerciseServiceContext';

function renderForm(path = '/exercises/new', fake = createFakeExerciseService()) {
  const auth = createFakeAuthService({ id: 'u1', email: 'a@b.co' });
  const router = createMemoryRouter(
    [
      { path: '/exercises', element: <p>Exercises list</p> },
      { path: '/exercises/new', element: <CustomExercisePage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <AuthProvider service={auth.service}>
      <ExerciseServiceProvider service={fake.service}>
        <RouterProvider router={router} />
      </ExerciseServiceProvider>
    </AuthProvider>,
  );
  return { fake, router, user: userEvent.setup() };
}

const nameField = () => screen.findByLabelText('Name');

describe('CustomExercisePage', () => {
  it('offers the seven equipment types and three body parts, as pressed-state chips', async () => {
    renderForm();
    await nameField();
    const equipment = screen.getByRole('group', { name: 'Equipment' });
    expect(equipment).toHaveTextContent('BarbellDumbbellMachineCableBodyweightEZ barSmith');
    const body = screen.getByRole('group', { name: 'Body part' });
    expect(body).toHaveTextContent('UpperLowerCore');
  });

  it('starts with the name from the search, when there is one', async () => {
    renderForm('/exercises/new?name=zercher+squat');
    expect(await nameField()).toHaveValue('zercher squat');
  });

  it.each([
    ['Barbell', /total including the bar/i],
    ['Dumbbell', /one dumbbell/i],
    ['Machine', /stack weight/i],
    ['Cable', /stack weight/i],
    ['Bodyweight', /weight you add/i],
    ['EZ bar', /total including the bar/i],
    ['Smith', /total including the bar/i],
  ])('explains what to log for %s', async (label, hint) => {
    const { user } = renderForm();
    await nameField();
    await user.click(screen.getByRole('button', { name: label }));
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves a new exercise with cleaned values and returns to the list', async () => {
    const { fake, router, user } = renderForm();
    await user.type(await nameField(), '  Zercher   squat ');
    await user.click(screen.getByRole('button', { name: 'Lower' }));
    await user.type(screen.getByLabelText(/what you will say/i), 'zercher, zercher squats, ');
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    expect(fake.service.create).toHaveBeenCalledWith('u1', expect.any(String), {
      name: 'Zercher squat',
      equipmentType: 'barbell',
      bodyPart: 'lower',
      aliases: ['zercher', 'zercher squats'],
    });
    expect(await screen.findByText('Exercises list')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/exercises');
  });

  it('shows field errors, focuses the first bad field, and saves nothing', async () => {
    const { fake, user } = renderForm();
    await nameField();
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    expect(screen.getByLabelText('Name')).toBeInvalid();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.getByText(/give the exercise a name/i)).toBeInTheDocument();
    expect(screen.getByText(/choose the body part/i)).toBeInTheDocument();
    expect(fake.service.create).not.toHaveBeenCalled();
  });

  it('clears an error as soon as the field is edited', async () => {
    const { user } = renderForm();
    await nameField();
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    await user.type(screen.getByLabelText('Name'), 'A');
    expect(screen.getByLabelText('Name')).not.toBeInvalid();
  });

  it('refuses a name that a built-in exercise already has', async () => {
    const { fake, user } = renderForm();
    await user.type(await nameField(), 'barbell bench press');
    await user.click(screen.getByRole('button', { name: 'Upper' }));
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(fake.service.create).not.toHaveBeenCalled();
  });

  it('refuses a name that one of your own exercises already has', async () => {
    const { user } = renderForm('/exercises/new', createFakeExerciseService([customExercise()]));
    await user.type(await nameField(), 'zercher SQUAT');
    await user.click(screen.getByRole('button', { name: 'Lower' }));
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it('refuses a spoken word that another exercise already uses', async () => {
    const { user } = renderForm();
    await user.type(await nameField(), 'My press');
    await user.click(screen.getByRole('button', { name: 'Upper' }));
    await user.type(screen.getByLabelText(/what you will say/i), 'bench');
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    expect(screen.getByText(/already used by another exercise: bench/i)).toBeInTheDocument();
  });

  it('retries a failed save with the same exercise id', async () => {
    const fake = createFakeExerciseService();
    fake.failNext('create', 'offline');
    const { user } = renderForm('/exercises/new', fake);
    await user.type(await nameField(), 'Zercher squat');
    await user.click(screen.getByRole('button', { name: 'Lower' }));
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i);
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    const [first, second] = fake.service.create.mock.calls;
    expect(second?.[1]).toBe(first?.[1]);
    expect(await screen.findByText('Exercises list')).toBeInTheDocument();
  });

  it.each([
    ['conflict', /already has an exercise with that name/i],
    ['unknown', /could not save/i],
  ] as const)('explains a %s failure and keeps what was typed', async (reason, message) => {
    const fake = createFakeExerciseService();
    fake.failNext('create', reason);
    const { user } = renderForm('/exercises/new', fake);
    await user.type(await nameField(), 'Zercher squat');
    await user.click(screen.getByRole('button', { name: 'Lower' }));
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Name')).toHaveValue('Zercher squat');
  });

  it('shows a saving state and ignores a second tap', async () => {
    const fake = createFakeExerciseService();
    let release: () => void = () => undefined;
    fake.service.create.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve({ status: 'ok', value: undefined });
      }),
    );
    const { user } = renderForm('/exercises/new', fake);
    await user.type(await nameField(), 'Zercher squat');
    await user.click(screen.getByRole('button', { name: 'Lower' }));
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    const saving = screen.getByRole('button', { name: /saving/i });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(fake.service.create).toHaveBeenCalledTimes(1);
    release();
    expect(await screen.findByText('Exercises list')).toBeInTheDocument();
  });

  it('blocks saving, with a notice and a retry, while your own exercises have not loaded', async () => {
    const fake = createFakeExerciseService([customExercise({ aliases: ['zercher'] })]);
    fake.failNext('listCustom', 'offline');
    const { user } = renderForm('/exercises/new', fake);
    await user.type(await nameField(), 'My squat');
    await user.click(screen.getByRole('button', { name: 'Lower' }));
    const notice = screen.getByRole('status', { name: /your exercises/i });
    expect(notice).toHaveTextContent(/cannot check for repeated/i);
    expect(screen.getByRole('button', { name: 'Save exercise' })).toBeDisabled();
    await user.click(within(notice).getByRole('button', { name: /try again/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save exercise' })).toBeEnabled(),
    );
    expect(screen.queryByRole('status', { name: /your exercises/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('My squat');
    // Now that the list is known, a spoken word that clashes with it is caught.
    await user.type(screen.getByLabelText(/what you will say/i), 'zercher');
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    expect(screen.getByText(/already used by another exercise: zercher/i)).toBeInTheDocument();
    expect(fake.service.create).not.toHaveBeenCalled();
  });

  it('focuses the first bad field in reading order, and links the body part error to its group', async () => {
    const { user } = renderForm();
    await user.type(await nameField(), 'Fine name');
    await user.type(screen.getByLabelText(/what you will say/i), 'bench');
    await user.click(screen.getByRole('button', { name: 'Save exercise' }));
    const group = screen.getByRole('group', { name: 'Body part' });
    expect(group).toHaveFocus();
    expect(group).toHaveAccessibleDescription(/choose the body part/i);
  });

  it('has a way back to the list', async () => {
    renderForm();
    await nameField();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/exercises');
  });
});
